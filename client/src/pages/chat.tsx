import { useAppSelector } from "@/store";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { ChatArea } from "@/components/ChatArea";

export default function ChatPage() {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="h-full bg-background">
      <ChatArea />
    </div>
  );
}