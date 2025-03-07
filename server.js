// This file helps Amplify understand that this is a server-side application
// It simply imports and runs the actual server code from the dist directory

// Check if we're in production mode
if (process.env.NODE_ENV === 'production') {
  // In production, run the compiled server code
  require('./dist/index.js');
} else {
  // In development, use the TypeScript source
  require('./server/index.ts');
} 