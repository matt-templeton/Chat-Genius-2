import { useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface WebSocketOptions {
  workspaceId: number;
  onChannelEvent?: (event: any) => void;
}

export function useWebSocket({ workspaceId, onChannelEvent }: WebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  const connect = useCallback(() => {
    // Don't try to connect if workspaceId is 0 or invalid
    if (!workspaceId) {
      return;
    }

    // Don't reconnect if already connected
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws?workspaceId=${workspaceId}`);

    ws.onopen = () => {
      console.log('WebSocket connected to workspace:', workspaceId);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket received message:', data);

        if (data.type === 'CONNECTED') {
          toast({
            title: 'Connected to workspace',
            description: `Successfully connected to workspace ${workspaceId}`,
          });
        } else if (onChannelEvent && ['CHANNEL_CREATED', 'CHANNEL_UPDATED', 'CHANNEL_ARCHIVED'].includes(data.type)) {
          onChannelEvent(data);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: 'Connection Error',
        description: 'Failed to connect to workspace',
        variant: 'destructive',
      });
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected from workspace:', workspaceId);
      // Only attempt to reconnect if we have a valid workspaceId
      if (workspaceId) {
        setTimeout(connect, 5000);
      }
    };

    wsRef.current = ws;
  }, [workspaceId, onChannelEvent, toast]);

  useEffect(() => {
    if (workspaceId) {
      connect();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
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