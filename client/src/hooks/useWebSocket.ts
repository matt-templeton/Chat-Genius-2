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
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();

  const cleanupConnection = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }

    if (wsRef.current) {
      // Only close if not already closing or closed
      if (wsRef.current.readyState !== WebSocket.CLOSING && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    setIsConnecting(false);
  }, []);

  const connect = useCallback(() => {
    if (!workspaceId || workspaceId <= 0) {
      return;
    }

    // If already connecting or connected, don't try to connect again
    if (isConnecting || 
        (wsRef.current && 
         (wsRef.current.readyState === WebSocket.CONNECTING || 
          wsRef.current.readyState === WebSocket.OPEN))) {
      return;
    }

    try {
      setIsConnecting(true);
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/ws?workspaceId=${workspaceId}`,
      );

      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected to workspace:", workspaceId);
        setIsConnecting(false);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (
            onChannelEvent &&
            ["CHANNEL_CREATED", "CHANNEL_UPDATED", "CHANNEL_ARCHIVED"].includes(
              data.type,
            )
          ) {
            onChannelEvent(data);
          }

          if (
            onMessageEvent &&
            ["MESSAGE_CREATED", "MESSAGE_UPDATED", "MESSAGE_DELETED"].includes(
              data.type,
            )
          ) {
            onMessageEvent(data);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        setIsConnecting(false);

        // Only attempt reconnection if:
        // 1. The close wasn't clean
        // 2. We haven't exceeded max attempts
        // 3. The component isn't unmounting (wsRef.current exists)
        if (!event.wasClean && reconnectAttempts.current < maxReconnectAttempts && wsRef.current) {
          const backoffTime = Math.min(
            1000 * Math.pow(2, reconnectAttempts.current),
            10000,
          );
          reconnectAttempts.current++;

          // Only show toast on first attempt
          if (reconnectAttempts.current === 1) {
            toast({
              title: "Connection Lost",
              description: "Connection to chat server lost. Attempting to reconnect...",
              variant: "destructive",
            });
          }

          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }

          reconnectTimeoutRef.current = setTimeout(() => {
            if (workspaceId && workspaceId > 0) {
              connect();
            }
          }, backoffTime);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          toast({
            title: "Connection Lost",
            description: "Unable to reconnect to chat server after multiple attempts.",
            variant: "destructive",
          });
        }

        wsRef.current = null;
      };
    } catch (error) {
      setIsConnecting(false);
      wsRef.current = null;
      console.error("WebSocket connection error:", error);
    }
  }, [workspaceId, onChannelEvent, onMessageEvent, toast, isConnecting]);

  useEffect(() => {
    // Clean up existing connection when workspaceId changes
    cleanupConnection();

    // Reset reconnection attempts
    reconnectAttempts.current = 0;

    // Attempt new connection
    if (workspaceId && workspaceId > 0) {
      connect();
    }

    // Cleanup function
    return () => {
      cleanupConnection();
    };
  }, [workspaceId, connect, cleanupConnection]);

  return {
    send: useCallback((message: any) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      }
    }, []),
  };
}