"use client"

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const SocialCreditContext = createContext();

export function SocialCreditProvider({ children }) {
  // Initialize state directly from localStorage if available (Lazy initializer)
  const [credit, setCredit] = useState(100);
  const [isLoaded, setIsLoaded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const isFirstLoad = useRef(true);

  // Sync with localStorage once on mount
  useEffect(() => {
    const savedCredit = localStorage.getItem('pela_credit');
    if (savedCredit !== null) {
      setCredit(parseInt(savedCredit, 10));
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever credit changes, but ONLY after initial load
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('pela_credit', credit.toString());
      
      // Punishment logic: if credit is 0 and not on /labura, redirect
      if (credit <= 0 && pathname !== '/labura') {
        router.push('/labura');
      }
    }
  }, [credit, isLoaded, pathname, router]);

  const addCredit = (amount) => {
    setCredit(prev => {
      const next = Math.min(100, prev + amount);
      console.log(`[SocialCredit] Adding ${amount}. ${prev} -> ${next}`);
      return next;
    });
  };

  const deductCredit = (amount) => {
    setCredit(prev => {
      const next = Math.max(0, prev - amount);
      console.log(`[SocialCredit] Deducting ${amount}. ${prev} -> ${next}`);
      return next;
    });
  };

  const value = {
    credit,
    addCredit,
    deductCredit,
    isLoaded
  };

  return (
    <SocialCreditContext.Provider value={value}>
      <div style={{
        filter: isLoaded && credit <= 0 ? 'sepia(100%) hue-rotate(-30deg) contrast(1.2) brightness(0.8)' : 'none',
        minHeight: '100vh',
        transition: 'filter 1s ease-in-out'
      }}>
        {children}
        {isLoaded && <CreditBar credit={credit} />}
      </div>
    </SocialCreditContext.Provider>
  );
}

function CreditBar({ credit }) {
  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 100000,
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: '10px',
      borderRadius: '8px',
      border: '1px solid #333',
      width: '200px',
      fontFamily: 'monospace',
      pointerEvents: 'none',
      boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
    }}>
      <div style={{ color: '#fff', fontSize: '10px', marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
        <span>CRÉDITO SOCIAL</span>
        <span>{credit}%</span>
      </div>
      <div style={{
        width: '100%',
        height: '6px',
        backgroundColor: '#222',
        borderRadius: '3px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${credit}%`,
          height: '100%',
          backgroundColor: credit > 50 ? '#4caf50' : credit > 20 ? '#ffeb3b' : '#f44336',
          transition: 'width 0.3s ease, background-color 0.3s ease'
        }}></div>
      </div>
      {credit <= 0 && (
        <div style={{ color: '#f44336', fontSize: '8px', marginTop: '5px', textAlign: 'center', fontWeight: 'bold' }}>
          AGARRÁ LA PALA
        </div>
      )}
    </div>
  );
}

export function useSocialCredit() {
  return useContext(SocialCreditContext);
}
