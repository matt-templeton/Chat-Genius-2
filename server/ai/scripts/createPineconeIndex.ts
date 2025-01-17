import 'dotenv/config';

import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { db } from "@db/index";
import { messages, workspaces, type Message } from "@db/schema";
import { eq } from "drizzle-orm";

// Define metadata type to match Pinecone's requirements
type MessageMetadata = {
  messageId: string;
  workspaceId: string;
  content: string;
  type: string;
  timestamp: number;
  channelId?: string;
  userId?: string;
  parentMessageId?: string;
}

// Batch size for processing messages
const BATCH_SIZE = 100;

// Initialize OpenAI embeddings
const embeddings = new OpenAIEmbeddings({
  modelName: "text-embedding-3-large",
  dimensions: 3072,
});

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

// Helper function to chunk array into batches
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function createIndex() {
  try {
    // Check if index already exists
    const indexList = await pinecone.listIndexes();
    
    // Check if 'slackers' exists in the index list
    const slackersExists = indexList.indexes?.some(index => index.name === 'slackers') ?? false;
    
    if (!slackersExists) {
      console.log('Creating new index "slackers"...');
      await pinecone.createIndex({
        name: 'slackers',
        dimension: 3072, // text-embedding-3-large dimension
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      console.log('Index created successfully');
    } else {
      console.log('Index "slackers" already exists');
    }
  } catch (error) {
    console.error('Error creating index:', error);
    throw error;
  }
}

async function populateIndex() {
  try {
    console.log('Starting index population...');
    
    // Get all workspaces
    const workspacesList = await db.select().from(workspaces);
    const index = pinecone.index('slackers');

    // Process messages for each workspace
    for (const workspace of workspacesList) {
      console.log(`Processing messages for workspace ${workspace.workspaceId}...`);
      
      // Get all messages for this workspace
      const workspaceMessages = await db.select()
        .from(messages)
        .where(eq(messages.workspaceId, workspace.workspaceId)) as Message[];

      // Skip if no messages
      if (workspaceMessages.length === 0) {
        console.log(`No messages found for workspace ${workspace.workspaceId}`);
        continue;
      }

      // Process messages in batches
      const batches = chunkArray(workspaceMessages, BATCH_SIZE);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`Processing batch ${batchIndex + 1}/${batches.length} for workspace ${workspace.workspaceId}`);
        
        // Generate embeddings for the batch
        const texts = batch.map(msg => msg.content);
        const embeddingVectors = await embeddings.embedDocuments(texts);
        
        // Prepare vectors for upsert
        const vectors = batch.map((msg, i) => {
          // Build metadata object with proper typing
          const metadata: MessageMetadata = {
            messageId: msg.messageId.toString(),
            workspaceId: msg.workspaceId.toString(),
            content: msg.content,
            type: 'message',
            timestamp: Math.floor(msg.createdAt.getTime() / 1000)
          };

          // Only add optional fields if they exist
          if (msg.channelId != null) {
            metadata.channelId = msg.channelId.toString();
          }
          if (msg.userId != null) {
            metadata.userId = msg.userId.toString();
          }
          if (msg.parentMessageId != null) {
            metadata.parentMessageId = msg.parentMessageId.toString();
          }

          return {
            id: `msg_${msg.messageId}`,
            values: embeddingVectors[i],
            metadata
          };
        });
        
        // Upsert vectors to the workspace's namespace
        await index.namespace(workspace.workspaceId.toString()).upsert(vectors);
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`Completed processing workspace ${workspace.workspaceId}`);
    }

    console.log('Index population completed successfully');
  } catch (error) {
    console.error('Error populating index:', error);
    throw error;
  }
}

async function main() {
  try {
    await createIndex();
    await populateIndex();
    console.log('Script completed successfully');
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === new URL(import.meta.url).href) {
  main();
} 