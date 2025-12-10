import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft, Key, TrendingUp, Bot, Shield } from 'lucide-react';

interface TutorialModalProps {
  open: boolean;
  onComplete: () => void;
}

const steps = [
  {
    icon: Shield,
    title: 'Welcome to TradingBot',
    content: 'Your intelligent trading companion for stocks and crypto. This app uses the Alpaca Markets API for paper trading - perfect for learning without risking real money.',
  },
  {
    icon: Key,
    title: 'Connect Your API Keys',
    content: 'Go to Settings and enter your Alpaca API credentials. For paper trading, use your paper trading keys from paper-api.alpaca.markets. Never share your secret key!',
  },
  {
    icon: TrendingUp,
    title: 'Choose a Strategy',
    content: 'Select from pre-built strategies like RSI Dip Buy for stocks or Momentum trading for crypto. Each strategy has clear rules - no complex machine learning required.',
  },
  {
    icon: Bot,
    title: 'Start Auto-Trading',
    content: 'Enable auto-trading to let the bot execute trades every 5 minutes based on your selected strategy. You can stop anytime with one click.',
  },
];

export function TutorialModal({ open, onComplete }: TutorialModalProps) {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const currentStep = steps[step];
  const Icon = currentStep.icon;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="glass sm:max-w-md" hideCloseButton>
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-primary/10 glow-primary">
              <Icon className="w-8 h-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">{currentStep.title}</DialogTitle>
        </DialogHeader>
        
        <p className="text-center text-muted-foreground py-4">
          {currentStep.content}
        </p>

        <div className="flex justify-center gap-1.5 py-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 0}
            className="flex-1"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <Button onClick={handleNext} className="flex-1">
            {step === steps.length - 1 ? 'Get Started' : 'Next'}
            {step < steps.length - 1 && <ChevronRight className="w-4 h-4 ml-1" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
