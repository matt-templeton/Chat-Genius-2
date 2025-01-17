import { useEffect, useRef, useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { WebSocketEvent, WebSocketChannelEvent, WebSocketMessageEvent, WebSocketReactionEvent } from '@/types/websocket';
import { useAppSelector } from "@/store";
import { useQueryClient } from "@tanstack/react-query";
import { Message } from "@/types/message";

interface WebSocketOptions {
  workspaceId: number;
  onChannelEvent?: (event: WebSocketChannelEvent) => void;
  onMessageEvent?: (event: WebSocketMessageEvent) => void;
  onReactionEvent?: (event: WebSocketReactionEvent) => void;
}

export function useWebSocket({
  workspaceId,
  onChannelEvent,
  onMessageEvent,
  onReactionEvent,
}: WebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const { user } = useAppSelector((state) => state.auth);
  const queryClient = useQueryClient();

  // Memoize the connect function
  const connect = useCallback(() => {
    // Don't connect if there's no workspaceId or if already connected/connecting
    if (
      !workspaceId ||
      workspaceId <= 0 ||
      isConnecting ||
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    try {
      setIsConnecting(true);
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/ws?workspaceId=${workspaceId}`
      );

      ws.onopen = () => {
        setIsConnecting(false);
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent;
          console.log("WebSocket received event:", data);
          
          if (onChannelEvent && ["CHANNEL_CREATED", "CHANNEL_UPDATED", "CHANNEL_ARCHIVED"].includes(data.type)) {
            onChannelEvent(data as WebSocketChannelEvent);
          } else if (onMessageEvent && data.type === "MESSAGE_CREATED") {
            onMessageEvent(data as WebSocketMessageEvent);
          } else if (onReactionEvent && ["REACTION_ADDED", "REACTION_REMOVED"].includes(data.type)) {
            console.log("Handling reaction event:", data);
            onReactionEvent(data as WebSocketReactionEvent);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onerror = () => {
        setIsConnecting(false);
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnecting(false);
        setIsConnected(false);
        wsRef.current = null;

        // Only attempt reconnection if we haven't reached max attempts
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
          reconnectAttempts.current++;
          reconnectTimeoutRef.current = setTimeout(connect, backoffTime);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      setIsConnecting(false);
      console.error("WebSocket connection error:", error);
    }
  }, [workspaceId, onChannelEvent, onMessageEvent, onReactionEvent]);

  // Connect only when workspaceId changes
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
  }, [workspaceId, connect]);

  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { send, isConnected };
}
