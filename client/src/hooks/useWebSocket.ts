import { useEffect, useRef, useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface WebSocketOptions {
  workspaceId: number;
  onChannelEvent?: (event: any) => void;
  onMessageEvent?: (event: any) => void;
}

export function useWebSocket({
  workspaceId,
  onChannelEvent,
  onMessageEvent,
}: WebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const connections = useRef(0);

  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();

  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (
      !workspaceId ||
      workspaceId <= 0 ||
      isConnecting ||
      connections.current > 0 ||
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      return;
    }

    // Clean up existing connection first
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      setIsConnecting(true);
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/ws?workspaceId=${workspaceId}`,
      );

      console.log(reconnectAttempts.current);
      ws.onopen = () => {
        console.log("WebSocket connected to workspace:", workspaceId);
        setIsConnecting(false);
        setIsConnected(true);
        connections.current = 1;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("WebSocket received message:", data);

          if (
            onChannelEvent &&
            ["CHANNEL_CREATED", "CHANNEL_UPDATED", "CHANNEL_ARCHIVED"].includes(
              data.type,
            )
          ) {
            onChannelEvent(data);
          } else if (onMessageEvent && data.type === "MESSAGE_CREATED") {
            console.log("Handling MESSAGE_CREATED event:", data);
            onMessageEvent(data);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onerror = () => {
        setIsConnecting(false);
      };

      ws.onclose = () => {
        setIsConnecting(false);
        setIsConnected(false);
        wsRef.current = null;

        if (reconnectAttempts.current < maxReconnectAttempts) {
          const backoffTime = Math.min(
            1000 * Math.pow(2, reconnectAttempts.current),
            10000,
          );
          reconnectAttempts.current++;

          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }

          reconnectTimeoutRef.current = setTimeout(connect, backoffTime);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      setIsConnecting(false);
      console.error("WebSocket connection error:", error);
    }
  }, [workspaceId, onChannelEvent, onMessageEvent]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
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
    isConnected,
  };
}
