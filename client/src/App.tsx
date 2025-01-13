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
import React from "react";

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />

      {/* Protected routes */}
      <Route path="/chat" component={ChatPage} />
      {/* Default route */}
      <Route path="/">
        {() => {
          window.location.href = "/login";
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
