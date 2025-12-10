import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (apiKeyId: string, secretKey: string, isPaper: boolean) => Promise<boolean>;
  onDisconnect: () => void;
  isConnected: boolean;
  isPaperMode: boolean;
}

export function SettingsModal({ 
  isOpen, 
  onClose, 
  onSave, 
  onDisconnect,
  isConnected,
  isPaperMode 
}: SettingsModalProps) {
  const [apiKeyId, setApiKeyId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [isPaper, setIsPaper] = useState(isPaperMode);
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!apiKeyId.trim() || !secretKey.trim()) {
      toast({
        title: "Error",
        description: "Please enter both API Key ID and Secret Key",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    const success = await onSave(apiKeyId.trim(), secretKey.trim(), isPaper);
    setIsLoading(false);

    if (success) {
      toast({
        title: "Connected",
        description: `Alpaca ${isPaper ? 'paper' : 'live'} account connected successfully`
      });
      setApiKeyId('');
      setSecretKey('');
      onClose();
    }
  };

  const handleDisconnect = () => {
    onDisconnect();
    toast({
      title: "Disconnected",
      description: "Alpaca account disconnected"
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alpaca API Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {isConnected ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <p className="text-emerald-400 font-medium">
                  ✓ Connected to Alpaca ({isPaperMode ? 'Paper' : 'Live'})
                </p>
              </div>
              <Button 
                variant="destructive" 
                onClick={handleDisconnect}
                className="w-full"
              >
                Disconnect Account
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="apiKeyId">API Key ID</Label>
                <Input
                  id="apiKeyId"
                  type="password"
                  value={apiKeyId}
                  onChange={(e) => setApiKeyId(e.target.value)}
                  placeholder="PK..."
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="secretKey">Secret Key</Label>
                <Input
                  id="secretKey"
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="Enter secret key"
                />
              </div>
              
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <Label htmlFor="paperMode">Paper Trading Mode</Label>
                <Switch
                  id="paperMode"
                  checked={isPaper}
                  onCheckedChange={setIsPaper}
                />
              </div>
              
              <Button 
                onClick={handleSave} 
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Connecting...' : 'Connect Account'}
              </Button>
            </>
          )}
          
          <p className="text-xs text-muted-foreground text-center">
            Get your API keys from{' '}
            <a 
              href="https://app.alpaca.markets/paper/dashboard/overview" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Alpaca Dashboard
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
