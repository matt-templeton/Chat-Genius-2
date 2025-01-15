import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PreferencesOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PreferencesOverlay({ open, onOpenChange }: PreferencesOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Preferences</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Placeholder for future preference settings */}
          <p className="text-sm text-muted-foreground">Preferences settings coming soon...</p>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 