import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Key, Shield, ExternalLink, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AlpacaCredentials } from '@/lib/types';
import { storage } from '@/lib/storage';
import { toast } from '@/hooks/use-toast';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onConnect: (credentials: AlpacaCredentials) => void;
}

export function SettingsModal({ open, onClose, onConnect }: SettingsModalProps) {
  const [apiKeyId, setApiKeyId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [isPaperTrading, setIsPaperTrading] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const savedCredentials = storage.getCredentials();
    if (savedCredentials) {
      setApiKeyId(savedCredentials.apiKeyId);
      setSecretKey(savedCredentials.secretKey);
      setIsPaperTrading(savedCredentials.isPaperTrading);
    }
  }, [open]);

  const handleConnect = async () => {
    if (!apiKeyId.trim() || !secretKey.trim()) {
      toast({
        title: "Missing Credentials",
        description: "Please enter both API Key ID and Secret Key.",
        variant: "destructive",
      });
      return;
    }

    setIsValidating(true);
    
    // Simulate validation
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const credentials: AlpacaCredentials = {
      apiKeyId: apiKeyId.trim(),
      secretKey: secretKey.trim(),
      isPaperTrading,
    };

    storage.setCredentials(credentials);
    onConnect(credentials);
    
    toast({
      title: "Connected Successfully",
      description: `Connected to Alpaca ${isPaperTrading ? 'Paper' : 'Live'} Trading API.`,
    });
    
    setIsValidating(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="glass sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            API Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-warning/10 border border-warning/20">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-warning" />
              <div>
                <p className="font-medium text-sm">Paper Trading Mode</p>
                <p className="text-xs text-muted-foreground">Recommended for testing</p>
              </div>
            </div>
            <Switch checked={isPaperTrading} onCheckedChange={setIsPaperTrading} />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKeyId">API Key ID</Label>
              <Input
                id="apiKeyId"
                placeholder="PK..."
                value={apiKeyId}
                onChange={(e) => setApiKeyId(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="secretKey">Secret Key</Label>
              <div className="relative">
                <Input
                  id="secretKey"
                  type={showSecret ? 'text' : 'password'}
                  placeholder="Your secret key..."
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className="font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted">
            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Get your API keys from{' '}
              <a
                href="https://app.alpaca.markets"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Alpaca Dashboard
                <ExternalLink className="w-3 h-3" />
              </a>
              . For paper trading, use keys from paper-api.alpaca.markets.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleConnect} disabled={isValidating} className="flex-1 gap-2">
              {isValidating ? (
                <>Validating...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Connect
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
