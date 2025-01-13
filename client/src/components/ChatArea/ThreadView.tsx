/**
 * ThreadView Component
 * Displays message threads with replies.
 * TODO: Implement full threading functionality
 */
import { Message } from "@/types/message";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ThreadViewProps {
  parentMessage: Message;
  replies: Message[];
  onClose: () => void;
}

export function ThreadView({ parentMessage, replies, onClose }: ThreadViewProps) {
  return (
    <Card className="h-full border-0">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Thread</h3>
      </div>
      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="p-4">
          {/* TODO: Implement thread view */}
          <p>Thread view coming soon...</p>
        </div>
      </ScrollArea>
    </Card>
  );
}

export default ThreadView;
