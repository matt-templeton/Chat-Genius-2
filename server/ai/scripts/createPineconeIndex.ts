import 'dotenv/config';

import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { db } from "@db/index";
import { messages, workspaces, type Message } from "@db/schema";
import { eq } from "drizzle-orm";
import 'dotenv/config';

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

    // Process each workspace
    for (const workspace of workspacesList) {
      console.log(`Processing workspace ${workspace.workspaceId}...`);
      
      // Get all messages for this workspace
      const workspaceMessages = await db.select()
        .from(messages)
        .where(eq(messages.workspaceId, workspace.workspaceId)) as Message[];

      // Process messages in batches
      const batches = chunkArray(workspaceMessages, BATCH_SIZE);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`Processing batch ${batchIndex + 1}/${batches.length} for workspace ${workspace.workspaceId}`);
        
        // Generate embeddings for the batch
        const texts = batch.map((msg: Message) => msg.content);
        const embeddingVectors = await embeddings.embedDocuments(texts);
        
        // Prepare vectors for upsert
        const vectors = batch.map((msg: Message, i: number) => {
          const metadata: Record<string, string | number> = {
            timestamp: Math.floor(new Date(msg.createdAt).getTime() / 1000),
            messageId: msg.messageId.toString(),
            workspaceId: msg.workspaceId.toString()
          };
          
          if (msg.userId) {
            metadata.userId = msg.userId.toString();
          }
          
          if (msg.channelId) {
            metadata.channelId = msg.channelId.toString();
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
      
      console.log(`Completed workspace ${workspace.workspaceId}`);
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
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === new URL(import.meta.url).href) {
  main();
} 