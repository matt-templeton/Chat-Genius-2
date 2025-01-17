import 'dotenv/config';

import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { db } from "@db/index";
import { messages, workspaces, channels, users, type Message } from "@db/schema";
import { eq, and } from "drizzle-orm";
import * as path from 'path';
import * as fs from 'fs/promises';

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

    // Get Thunderdome workspace for PDFs
    const thunderdome = await db.query.workspaces.findFirst({
      where: eq(workspaces.name, 'Thunderdome')
    });

    if (!thunderdome) {
      throw new Error('Thunderdome workspace not found');
    }

    // Get Thunderdome's general channel
    const generalChannel = await db.query.channels.findFirst({
      where: and(
        eq(channels.workspaceId, thunderdome.workspaceId),
        eq(channels.name, 'general')
      )
    });

    if (!generalChannel) {
      throw new Error('General channel not found in Thunderdome workspace');
    }

    // Process messages for each workspace
    for (const workspace of workspacesList) {
      console.log(`Processing messages for workspace ${workspace.workspaceId}...`);
      
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
    }

    // Process PDFs from philosopher directories
    console.log('Processing philosopher PDFs...');
    const usersDir = path.join(process.cwd(), 'db', 'seed', 'users');
    const userDirs = await fs.readdir(usersDir);

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    for (const dir of userDirs) {
      console.log(`Processing PDFs for ${dir}...`);
      const dirPath = path.join(usersDir, dir);
      const files = await fs.readdir(dirPath);
      
      // Get user ID from database
      const user = await db.query.users.findFirst({
        where: eq(users.displayName, dir)
      });

      if (!user) {
        console.error(`User not found for ${dir}, skipping...`);
        continue;
      }

      // Process each PDF in the directory
      for (const file of files) {
        if (!file.toLowerCase().endsWith('.pdf')) continue;

        console.log(`Processing ${file}...`);
        const filePath = path.join(dirPath, file);
        const title = path.basename(file, '.pdf');

        try {
          // Load and split PDF
          const loader = new PDFLoader(filePath);
          const docs = await loader.load();
          const splitDocs = await textSplitter.splitDocuments(docs);

          // Generate embeddings for each chunk
          for (let i = 0; i < splitDocs.length; i++) {
            const doc = splitDocs[i];
            const [embedding] = await embeddings.embedDocuments([doc.pageContent]);

            const vector = {
              id: `pdf_${user.userId}_${title}_${i}`,
              values: embedding,
              metadata: {
                userId: user.userId.toString(),
                channelId: generalChannel.channelId.toString(),
                workspaceId: thunderdome.workspaceId.toString(),
                title,
                author: dir,
                chunk: i,
                pageNumber: doc.metadata.loc?.pageNumber,
                timestamp: Math.floor(Date.now() / 1000)
              }
            };

            // Upsert vector to Thunderdome's namespace
            await index.namespace(thunderdome.workspaceId.toString()).upsert([vector]);
            await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting delay
          }
        } catch (error) {
          console.error(`Error processing PDF ${file}:`, error);
        }
      }
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