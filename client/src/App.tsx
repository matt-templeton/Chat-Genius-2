import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import { Provider } from "react-redux";
import { store } from "./store";
import LoginPage from "@/pages/login";
import ChatPage from "@/pages/chat";
import SignupPage from "@/pages/signup";
import { WorkspaceNavigation } from "@/components/WorkspaceNavigation";
import { ChannelList } from "@/components/ChannelList";
import { DirectMessagesList } from "@/components/DirectMessagesList";
import React from 'react';

// ChatLayout component to wrap the chat page with workspace navigation
function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      {/* Workspace navigation sidebar */}
      <aside className="w-64 border-r border-border bg-background">
        <WorkspaceNavigation />
      </aside>

      {/* Channels and DMs sidebar */}
      <aside className="w-64 border-r border-border bg-background flex flex-col">
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-shrink-0">
            <ChannelList />
          </div>
          <div className="flex-1">
            <DirectMessagesList />
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />

      {/* Protected routes */}
      <Route path="/chat">
        {() => (
          <ChatLayout>
            <ChatPage />
          </ChatLayout>
        )}
      </Route>

      {/* Default route */}
      <Route path="/">
        {() => {
          window.location.href = '/login';
          return null;
        }}
      </Route>

      {/* 404 fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <Router />
        <Toaster />
      </QueryClientProvider>
    </Provider>
  );
}

export default App;