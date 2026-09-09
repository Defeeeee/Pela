export const NUM_ACTIONS = 33;

export function decodeAction(actionIndex) {
  if (actionIndex === 0) {
    return { dx: 0, dy: 0, split: false };
  }
  
  const isSplit = actionIndex > 16;
  const headingIndex = isSplit ? actionIndex - 17 : actionIndex - 1;
  
  const angle = (headingIndex * 2 * Math.PI) / 16;
  
  return {
    dx: Math.cos(angle),
    dy: Math.sin(angle),
    split: isSplit
  };
}
