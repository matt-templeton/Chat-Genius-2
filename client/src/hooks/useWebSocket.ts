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
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(`ws://${window.location.host}/ws?workspaceId=${workspaceId}`);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
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
      console.log('WebSocket disconnected');
      // Attempt to reconnect after a delay
      setTimeout(connect, 5000);
    };

    wsRef.current = ws;
  }, [workspaceId, onChannelEvent, toast]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
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
