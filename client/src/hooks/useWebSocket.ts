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
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const { toast } = useToast();

  const connect = useCallback(() => {
    if (!workspaceId || workspaceId <= 0 || isConnecting || 
        reconnectAttempts.current >= maxReconnectAttempts ||
        wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      setIsConnecting(true);
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/ws?workspaceId=${workspaceId}`,
      );

      ws.onopen = () => {
        console.log("WebSocket connected to workspace:", workspaceId);
        setIsConnecting(false);
        reconnectAttempts.current = 0;
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

      ws.onerror = () => {
        setIsConnecting(false);
        reconnectAttempts.current++;

        if (reconnectAttempts.current >= maxReconnectAttempts) {
          toast({
            title: "Connection Error",
            description: "Failed to connect to workspace. Please refresh the page.",
            variant: "destructive",
          });
        }
      };

      ws.onclose = (event) => {
        setIsConnecting(false);
        wsRef.current = null;

        if (event.code !== 1000 && event.code !== 1001 && reconnectAttempts.current < maxReconnectAttempts) {
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
          setTimeout(connect, timeout);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      setIsConnecting(false);
      toast({
        title: "Connection Error",
        description: "Failed to establish connection.",
        variant: "destructive",
      });
    }
  }, [workspaceId, onChannelEvent, toast, isConnecting]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounted");
        wsRef.current = null;
      }
      setIsConnecting(false);
      reconnectAttempts.current = 0;
    };
  }, [connect]);

  return {
    send: useCallback((message: any) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      }
    }, []),
  };
}