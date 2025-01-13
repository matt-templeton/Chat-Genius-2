import { useEffect, useRef, useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface WebSocketOptions {
  workspaceId: number;
  onChannelEvent?: (event: any) => void;
}

export function useWebSocket({
  workspaceId,
  onChannelEvent,
}: WebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  const connect = useCallback(() => {
    // Don't connect if no workspace ID or already connecting or already connected
    if (!workspaceId || workspaceId <= 0 || isConnecting || (wsRef.current?.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      console.log("Attempting WebSocket connection to workspace:", workspaceId);
      setIsConnecting(true);

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/ws?workspaceId=${workspaceId}`,
      );

      ws.onopen = () => {
        console.log("WebSocket connected to workspace:", workspaceId);
        setIsConnecting(false);
        toast({
          title: "Connected",
          description: `Connected to workspace ${workspaceId}`,
        });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (onChannelEvent && ["CHANNEL_CREATED", "CHANNEL_UPDATED", "CHANNEL_ARCHIVED"].includes(data.type)) {
            onChannelEvent(data);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsConnecting(false);
        toast({
          title: "Connection Error",
          description: "Failed to connect to workspace. Please refresh the page to try again.",
          variant: "destructive",
        });
      };

      ws.onclose = (event) => {
        console.log(
          "WebSocket disconnected from workspace:",
          workspaceId,
          "Code:",
          event.code,
          "Reason:",
          event.reason,
        );
        setIsConnecting(false);
        wsRef.current = null;

        // Only show toast for unexpected closures
        if (event.code !== 1000 && event.code !== 1001) {
          toast({
            title: "Connection Lost",
            description: "Lost connection to workspace. Please refresh the page to reconnect.",
            variant: "destructive",
          });
        }
      };

      // Clean up any existing connection before assigning the new one
      if (wsRef.current) {
        wsRef.current.close(1000, "New connection being established");
      }
      wsRef.current = ws;

    } catch (error) {
      console.error("Error creating WebSocket connection:", error);
      setIsConnecting(false);
      toast({
        title: "Connection Error",
        description: "Failed to establish connection. Please refresh the page to try again.",
        variant: "destructive",
      });
    }
  }, [workspaceId, onChannelEvent, toast, isConnecting]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    console.log("Initiating WebSocket connection for workspace:", workspaceId);

    // Create new connection
    connect();

    // Cleanup on unmount or workspace change
    return () => {
      console.log("Cleaning up WebSocket connection for workspace:", workspaceId);
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounting or workspace changed");
        wsRef.current = null;
      }
      setIsConnecting(false);
    };
  }, [connect, workspaceId]);

  return {
    send: useCallback((message: any) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      }
    }, []),
  };
}