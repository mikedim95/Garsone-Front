
import React from 'react';
import AppLayout from '@/components/AppLayout';
import { AppProvider } from '@/contexts/AppContext';
import { PageTransition } from '@/components/ui/page-transition';

const Index: React.FC = () => {
  return (
    <AppProvider>
      <PageTransition>
        <AppLayout />
      </PageTransition>
    </AppProvider>
  );
};

export default Index;
