import { useEffect, useRef, useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface WebSocketOptions {
  workspaceId: number;
  onChannelEvent?: (event: any) => void;
}

export function useWebSocket({ workspaceId, onChannelEvent }: WebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef<number>(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  const connect = useCallback(() => {
    // Don't try to connect if workspaceId is invalid
    if (!workspaceId || workspaceId <= 0) {
      console.log('Skipping WebSocket connection - invalid workspace ID:', workspaceId);
      return;
    }

    // Don't attempt to connect if we're already in the process
    if (isConnecting) {
      console.log('Connection attempt already in progress, skipping');
      return;
    }

    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }

    // Don't reconnect if already connected
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected to workspace:', workspaceId);
      return;
    }

    // Close existing connection if any
    if (wsRef.current) {
      console.log('Closing existing WebSocket connection');
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      console.log('Attempting WebSocket connection to workspace:', workspaceId);
      setIsConnecting(true);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws?workspaceId=${workspaceId}`);

      ws.onopen = () => {
        console.log('WebSocket connected to workspace:', workspaceId);
        reconnectAttemptsRef.current = 0; // Reset reconnection attempts on successful connection
        setIsConnecting(false);
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
        setIsConnecting(false);
        // Only show toast for non-connection errors
        if (ws.readyState === WebSocket.OPEN) {
          toast({
            title: 'Connection Error',
            description: 'Error in workspace connection',
            variant: 'destructive',
          });
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected from workspace:', workspaceId, 'Code:', event.code, 'Reason:', event.reason);
        setIsConnecting(false);

        // Don't reconnect if:
        // 1. Normal closure
        // 2. Invalid workspace
        // 3. Explicitly closed due to workspace change
        // 4. Max reconnection attempts reached (10)
        if (
          event.code === 1000 || // Normal closure
          !workspaceId || 
          workspaceId <= 0 ||
          (event.code === 4000 && event.reason === 'Workspace ID is required') ||
          reconnectAttemptsRef.current >= 10
        ) {
          wsRef.current = null;
          return;
        }

        // For abnormal closures (code 1006), increment the attempt counter more aggressively
        if (event.code === 1006) {
          reconnectAttemptsRef.current += 2;
        } else {
          reconnectAttemptsRef.current++;
        }

        // If we've hit the maximum attempts, log and stop trying
        if (reconnectAttemptsRef.current >= 10) {
          console.log('Maximum reconnection attempts reached, stopping reconnection');
          toast({
            title: 'Connection Failed',
            description: 'Unable to establish stable connection to workspace. Please refresh the page.',
            variant: 'destructive',
          });
          return;
        }

        // Schedule reconnection with exponential backoff
        const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000); // Max 30 seconds

        if (!reconnectTimeoutRef.current) {
          console.log(`Scheduling reconnection attempt ${reconnectAttemptsRef.current} in ${backoffTime}ms...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect...');
            reconnectTimeoutRef.current = undefined;
            connect();
          }, backoffTime);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setIsConnecting(false);
    }
  }, [workspaceId, onChannelEvent, toast, isConnecting]);

  useEffect(() => {
    // Only attempt to connect if we have a valid workspace
    if (workspaceId && workspaceId > 0) {
      console.log('Initiating WebSocket connection for workspace:', workspaceId);
      connect();
    }

    return () => {
      console.log('Cleaning up WebSocket connection for workspace:', workspaceId);
      // Clear any pending reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = undefined;
      }

      // Reset reconnection attempts
      reconnectAttemptsRef.current = 0;
      setIsConnecting(false);

      // Close the WebSocket connection if it exists
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
      } else {
        console.warn('Cannot send message - WebSocket is not connected');
      }
    }, []),
  };
}