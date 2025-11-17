import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';

const steps = [
  { number: '01', text: 'Scan QR Code', desc: 'Customer scans table QR' },
  { number: '02', text: 'Browse Menu', desc: 'View items with images' },
  { number: '03', text: 'Add to Cart', desc: 'Customize and add items' },
  { number: '04', text: 'Place Order', desc: 'Checkout with one tap' },
  { number: '05', text: 'Get Notified', desc: 'Real-time updates' },
];

export const AnimatedMockup = () => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % steps.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="py-32 bg-background overflow-hidden">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-20">
          <h2 className="text-6xl md:text-7xl font-black mb-6 text-foreground tracking-tight">
            How It Works
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-light">
            A seamless ordering experience in five simple steps
          </p>
        </div>

        <div className="relative">
          {/* Connection lines */}
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-secondary -translate-y-1/2" />
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 relative">
            {steps.map((step, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div 
                  className={`relative mb-6 transition-all duration-500 ${
                    idx === currentStep ? 'scale-110' : 'scale-100'
                  }`}
                >
                  <div 
                    className={`w-20 h-20 rounded-full flex items-center justify-center font-black text-2xl transition-all duration-500 ${
                      idx === currentStep
                        ? 'bg-gradient-primary text-primary-foreground shadow-2xl animate-glow'
                        : idx < currentStep
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {step.number}
                  </div>
                  {idx < steps.length - 1 && (
                    <ArrowRight className={`hidden md:block absolute -right-10 top-1/2 -translate-y-1/2 w-8 h-8 transition-colors ${
                      idx < currentStep ? 'text-foreground' : 'text-muted-foreground'
                    }`} />
                  )}
                </div>
                <h3 
                  className={`text-lg font-bold mb-2 text-center transition-colors ${
                    idx === currentStep ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  {step.text}
                </h3>
                <p className="text-sm text-muted-foreground text-center">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
