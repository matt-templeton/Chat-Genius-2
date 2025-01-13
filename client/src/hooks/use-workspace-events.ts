import { useEffect, useRef } from 'react';
import { queryClient } from '@/lib/queryClient';
import type { WebSocketEvent } from '@/types/websocket';

interface UseWorkspaceEventsOptions {
  workspaceId: number;
  onError?: (error: Error) => void;
}

export function useWorkspaceEvents({ workspaceId, onError }: UseWorkspaceEventsOptions) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Create WebSocket connection
    const ws = new WebSocket(`ws://${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Subscribe to workspace events
      ws.send(JSON.stringify({
        type: 'subscribe',
        workspaceId
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketEvent;

        switch (message.type) {
          case 'channel_created':
            // Invalidate the channels query to trigger a refetch
            queryClient.invalidateQueries({
              queryKey: [`/api/v1/workspaces/${workspaceId}/channels`]
            });
            break;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
        onError?.(error instanceof Error ? error : new Error('Failed to parse WebSocket message'));
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      onError?.(new Error('WebSocket connection error'));
    };

    return () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [workspaceId, onError]);
}