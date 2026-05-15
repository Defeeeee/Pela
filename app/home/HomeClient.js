"use client"

import { useEffect } from 'react';
import LoadingScreen from '../LoadingScreen';
import { useSocialCredit } from '../SocialCreditContext';

export default function HomeClient({ fileName, delay, initialTitle }) {
  const { deductCredit } = useSocialCredit();

  useEffect(() => {
    const interval = setInterval(() => {
      deductCredit(1);
    }, 1000);
    return () => clearInterval(interval);
  }, [deductCredit]);

  return (
    <LoadingScreen fileName={fileName} delay={delay} initialTitle={initialTitle} />
  );
}
