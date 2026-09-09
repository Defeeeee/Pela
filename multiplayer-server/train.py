import subprocess
import json
import torch
import torch.nn as nn
import torch.optim as optim
import random
import time
from collections import deque
import os
import concurrent.futures

class DQN(nn.Module):
    def __init__(self, input_size, output_size):
        super(DQN, self).__init__()
        self.net = nn.Sequential(
            nn.Linear(input_size, 512),
            nn.ReLU(),
            nn.Linear(512, 512),
            nn.ReLU(),
            nn.Linear(512, 256),
            nn.ReLU(),
            nn.Linear(256, output_size)
        )
        
    def forward(self, x):
        return self.net(x)

class ReplayBuffer:
    def __init__(self, capacity):
        self.buffer = deque(maxlen=capacity)
    
    def push(self, state, action, reward, next_state, done):
        self.buffer.append((state.clone().detach(), action, reward, next_state.clone().detach(), done))
        
    def sample(self, batch_size):
        batch = random.sample(self.buffer, batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)
        return (torch.stack(states), 
                torch.tensor(actions, dtype=torch.int64), 
                torch.tensor(rewards, dtype=torch.float32), 
                torch.stack(next_states), 
                torch.tensor(dones, dtype=torch.float32))
    
    def __len__(self):
        return len(self.buffer)

def interact_with_env(p, action, is_spectator):
    try:
        p.stdin.write(f"{action},{1 if is_spectator else 0}\n")
        p.stdin.flush()
        resp_line = p.stdout.readline()
        if not resp_line:
            return None
        resp_data = json.loads(resp_line)
        
        # Check if done and read reset
        if resp_data.get('done'):
            reset_line = p.stdout.readline()
            if reset_line:
                reset_data = json.loads(reset_line)
                resp_data['reset_state'] = reset_data.get('state')
        return resp_data
    except Exception as e:
        return None

def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")
    
    # Launch Vectorized Node.js environments
    num_envs = 32
    procs = []
    states_list = []
    
    # Thread pool for multithreaded IPC to bypass Python GIL bottleneck on standard I/O
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=num_envs)
    
    for i in range(num_envs):
        args = ['node', 'training/training_bridge.js']
        p = subprocess.Popen(
            args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True
        )
        init_line = p.stdout.readline()
        init_data = json.loads(init_line)
        states_list.append(init_data.get('state'))
        procs.append(p)
        
    state = torch.tensor(states_list, dtype=torch.float32).to(device)
    
    # Model Setup
    input_size = 131
    output_size = 33
    policy_net = DQN(input_size, output_size).to(device)
    target_net = DQN(input_size, output_size).to(device)
    optimizer = optim.Adam(policy_net.parameters(), lr=1e-4)
    
    if os.path.exists('training/model.pth'):
        print("Loading existing model weights...")
        policy_net.load_state_dict(torch.load('training/model.pth', map_location=device, weights_only=True))
        if os.path.exists('training/optimizer.pth'):
            optimizer.load_state_dict(torch.load('training/optimizer.pth', map_location=device, weights_only=True))
            
    target_net.load_state_dict(policy_net.state_dict())
    target_net.eval()
    
    memory = ReplayBuffer(250000)
    
    # Hyperparameters cranked up to max hardware utility
    batch_size = 1024
    gamma = 0.99
    epsilon = 1.0
    epsilon_decay = 0.99999 
    min_epsilon = 0.05
    target_update = 2000 
    
    episodes = 0
    step = 0
    total_reward = 0
    start_time = time.time()
    batch_start = start_time
    max_mass = 0
    env_masses = [20] * num_envs
    spectator_env = 0
    last_spectator_switch = time.time()
    
    print(f"RL Bridge connected to {num_envs} vectorized environments using ThreadPoolExecutor. Starting advanced DQN training loop on CUDA...")
    metrics_file = open('training/metrics.jsonl', 'a')
    
    while True:
        step += 1
        
        # Epsilon greedy
        actions = []
        if random.random() < epsilon:
            actions = [random.randint(0, output_size - 1) for _ in range(num_envs)]
        else:
            with torch.no_grad():
                q_vals = policy_net(state)
                actions = q_vals.argmax(dim=1).tolist()
                
        # Spectator logic: show the biggest one with 5s cooldown
        now = time.time()
        if now - last_spectator_switch > 5.0:
            best_env = env_masses.index(max(env_masses))
            if best_env != spectator_env:
                spectator_env = best_env
                last_spectator_switch = now
                
        is_spectator = [i == spectator_env for i in range(num_envs)]
        
        # Interact concurrently with all environments
        results = list(executor.map(lambda x: interact_with_env(x[0], x[1], x[2]), zip(procs, actions, is_spectator)))
        
        next_states_list = []
        for i, resp_data in enumerate(results):
            if not resp_data:
                # Fallback to zero state to not crash
                next_states_list.append(states_list[i])
                continue
                
            next_state_cpu = torch.tensor(resp_data['state'], dtype=torch.float32)
            
            reward = resp_data['reward']
            done = resp_data['done']
            mass = resp_data['mass']
            env_masses[i] = mass
            
            memory.push(state[i], actions[i], reward, next_state_cpu, done)
            
            # Use reset state for the next step if done
            if done and 'reset_state' in resp_data:
                next_states_list.append(resp_data['reset_state'])
                states_list[i] = resp_data['reset_state']
            else:
                next_states_list.append(resp_data['state'])
                states_list[i] = resp_data['state']
            
            if i == 0:
                total_reward += reward
                if mass > max_mass:
                    max_mass = mass
                if done:
                    episodes += 1
                    
        state = torch.tensor(next_states_list, dtype=torch.float32).to(device)
        
        # Train from replay buffer (Train every step because we just added 32 transitions!)
        if len(memory) > batch_size:
            b_states, b_actions, b_rewards, b_next_states, b_dones = memory.sample(batch_size)
            b_states = b_states.to(device)
            b_actions = b_actions.unsqueeze(1).to(device)
            b_rewards = b_rewards.to(device)
            b_next_states = b_next_states.to(device)
            b_dones = b_dones.to(device)
            
            state_action_values = policy_net(b_states).gather(1, b_actions).squeeze()
            
            with torch.no_grad():
                next_state_values = target_net(b_next_states).max(1)[0]
                expected_state_action_values = b_rewards + (gamma * next_state_values * (1 - b_dones))
                
            loss = nn.SmoothL1Loss()(state_action_values, expected_state_action_values)
            
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_value_(policy_net.parameters(), 100)
            optimizer.step()
        
        # Update target network
        if step % target_update == 0:
            target_net.load_state_dict(policy_net.state_dict())
            
        if step % 5000 == 0:
            torch.save(policy_net.state_dict(), 'training/model.pth')
            torch.save(optimizer.state_dict(), 'training/optimizer.pth')
            
        epsilon = max(min_epsilon, epsilon * epsilon_decay)
        
        if step % (1000 // num_envs) == 0:
            batch_time = max(0.001, time.time() - batch_start)
            tps = 1000 / batch_time
            print(f"Step {step} | Episodes {episodes} | Mass: {mass} | Mem: {len(memory)} | TPS: {tps:.0f} | Eps: {epsilon:.3f}")
            
            metrics = {
                "generation": step // (1000 // num_envs),
                "elapsedSeconds": time.time() - start_time,
                "gamesPlayed": episodes,
                "decisionsMade": step * num_envs,
                "ticksPerSecond": tps,
                "avgReward": total_reward / max(1, episodes),
                "maxMass": max_mass,
                "currentMass": mass
            }
            metrics_file.write(json.dumps(metrics) + "\n")
            metrics_file.flush()
            batch_start = time.time()

if __name__ == '__main__':
    main()
