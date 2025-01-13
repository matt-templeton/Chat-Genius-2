import { type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** 
 * BaseOverlayProps: common modal overlay props.
 */
export interface BaseOverlayProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * BaseOverlay: A shared modal overlay component.
 * Used as a foundation for other overlay components in the application.
 */
export function BaseOverlay({ visible, onClose, children }: BaseOverlayProps) {
  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        {children}
      </DialogContent>
    </Dialog>
  );
}

export default BaseOverlay;
