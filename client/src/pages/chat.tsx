import { useAppSelector } from "@/store";
import { useLocation } from "wouter";
import { useEffect } from "react";

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
    <div className="min-h-screen bg-background p-8">
      <h1 className="text-2xl font-bold mb-4">Chat</h1>
      <div className="p-4 bg-card rounded shadow">
        PLACEHOLDER
      </div>
    </div>
  );
}