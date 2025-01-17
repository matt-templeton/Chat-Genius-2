import { Router } from 'express';
import { db } from "@db";
import { messages, channels, users, userWorkspaces, userChannels, files, type Message } from "@db/schema";
import { eq, and, desc, lt, sql, isNull } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { z } from 'zod';
import { getWebSocketManager } from '../websocket/WebSocketManager';
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { runPythonScript } from '../utils/pythonRunner';
import path from 'path';
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { PineconeStore } from "@langchain/pinecone";

// Import PdfMetadata type from files route
interface PdfMetadata {
  [key: string]: string | number;
  userId: string;
  type: string;
  title: string;
  channelId: string;
  pageNumber: number;
  text: string;
}

/**
 * Sanitize text to ensure valid UTF-8 encoding and remove problematic characters
 * @param text The input text to sanitize
 * @returns Sanitized text safe for database storage
 */
function sanitizeText(text: string): string {
  return text
    // Replace null bytes
    .replace(/\0/g, '')
    // Replace other common problematic characters
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, '')
    // Handle surrogate pairs properly
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\x00-\x7F]/g, char => {
      try {
        // Test if the character can be encoded properly
        return new TextEncoder().encode(char).length > 0 ? char : '';
      } catch {
        return '';
      }
    })
    // Normalize unicode characters
    .normalize('NFKC');
}

interface SearchMatch {
  metadata: PdfMetadata;
  score: number;
  id: string;
}

const router = Router();

// Initialize OpenAI embeddings
const embeddings = new OpenAIEmbeddings({
  modelName: "text-embedding-3-large",
  dimensions: 3072,
});

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

// Input validation schemas
const createMessageSchema = z.object({
  content: z.string().min(1),
  parentMessageId: z.number().optional(),
  hasAttachments: z.boolean().optional(),
  identifier: z.number().optional()
});

const updateMessageSchema = z.object({
  content: z.string().min(1, "Message content cannot be empty")
});

// Initialize OpenAI tools
const llm = new ChatOpenAI({
  temperature: 0.7,
  modelName: "gpt-4-turbo-preview",
});

/**
 * Handle PDFBot commands
 */
async function handlePDFBotCommand(message: Message) {
  // Get PDFBot's user ID
  const pdfBot = await db.query.users.findFirst({
    where: eq(users.displayName, 'PDFBot')
  });

  if (!pdfBot) {
    console.error('PDFBot user not found in database');
    return;
  }

  // After this point, we know pdfBot exists
  const botUserId = pdfBot.userId;

  // Remove '@PDFBot' from the start of the message
  const commandText = message.content.replace(/^@PDFBot\s+/, '').trim();
  
  // Check for function calls
  const functionMatch = commandText.match(/^\/(\w+)\s*(.*)/);
  
  let command = 'search'; // Default command
  let queryText = commandText;
  
  if (functionMatch) {
    command = functionMatch[1].toLowerCase();
    queryText = functionMatch[2].trim();
  }

  // Create PDFBot response message
  async function respondWithMessage(content: string) {
    const now = new Date();
    const [botMessage] = await db.insert(messages)
      .values({
        workspaceId: message.workspaceId,
        channelId: message.channelId,
        userId: botUserId,
        content,
        parentMessageId: message.parentMessageId,
        hasAttachments: false,
        deleted: false,
        postedAt: now,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    // Get the bot's user info
    const botUser = await db.query.users.findFirst({
      where: eq(users.userId, botUserId),
      columns: {
        displayName: true,
        profilePicture: true
      }
    });

    // Emit websocket event
    const wsManager = getWebSocketManager();
    wsManager.broadcastToWorkspace(message.workspaceId, {
      type: "MESSAGE_CREATED",
      workspaceId: message.workspaceId,
      data: {
        messageId: botMessage.messageId,
        channelId: botMessage.channelId,
        content: botMessage.content,
        userId: botMessage.userId,
        workspaceId: botMessage.workspaceId,
        parentMessageId: botMessage.parentMessageId,
        hasAttachments: botMessage.hasAttachments,
        createdAt: botMessage.createdAt.toISOString(),
        replyCount: 0,
        user: {
          userId: botMessage.userId,
          displayName: botUser?.displayName || 'PDFBot',
          profilePicture: botUser?.profilePicture
        }
      }
    });

    return botMessage;
  }
  
  // Handle different commands
  switch (command) {
    case 'search': {
      // Check if this is a reply to a message
      if (!message.parentMessageId) {
        await respondWithMessage("Please reply to a message with a PDF attachment to search within it.");
        return;
      }

      // Get the parent message
      const parentMessage = await db.query.messages.findFirst({
        where: eq(messages.messageId, message.parentMessageId)
      });

      if (!parentMessage) {
        await respondWithMessage("Could not find the message you're replying to.");
        return;
      }

      // Check if parent message has a PDF attachment
      const attachedFile = await db.query.files.findFirst({
        where: and(
          eq(files.messageId, parentMessage.messageId),
          eq(files.fileType, 'application/pdf')
        )
      });

      if (!attachedFile) {
        await respondWithMessage("The message you're replying to doesn't have a PDF attachment.");
        return;
      }

      if (!queryText.trim()) {
        await respondWithMessage("Please provide a search query after the command.");
        return;
      }

      try {
        // Get the document title (filename without .pdf extension)
        const title = path.basename(attachedFile.filename, '.pdf');

        // Generate enhanced queries using RAG fusion
        const ragResult = await runPythonScript('rag_fusion.py', [queryText]);
        if (!ragResult.queries) {
          throw new Error(ragResult.error || 'Failed to generate enhanced queries');
        }

        // Get enhanced queries from the result
        const enhancedQueries = ragResult.queries as string[];
        
        // Generate embeddings and search for each enhanced query
        const searchResults: SearchMatch[][] = [];
        
        for (const query of enhancedQueries) {
          // Generate embedding for the query
          const [queryEmbedding] = await embeddings.embedDocuments([query]);

          // Get Pinecone index
          const index = pinecone.index('slackers');

          // Query the index with metadata filter
          const queryResponse = await index.namespace(message.workspaceId.toString()).query({
            vector: queryEmbedding,
            topK: 10, // Get more results per query for better fusion
            filter: {
              type: { $eq: 'pdf' },
              title: { $eq: title }
            },
            includeMetadata: true
          });

          if (queryResponse.matches) {
            // Transform Pinecone results to SearchMatch type
            const matches = queryResponse.matches.map(match => ({
              id: match.id,
              score: match.score ?? 0,
              metadata: match.metadata as PdfMetadata
            }));
            searchResults.push(matches);
          }
        }

        // If no results found for any query
        if (searchResults.length === 0) {
          await respondWithMessage("No relevant matches found in the document.");
          return;
        }

        // Apply reciprocal rank fusion using Python script
        const fusionResult = await runPythonScript('reciprocal_rank_fusion.py', [], searchResults);
        if (!fusionResult.success) {
          throw new Error(fusionResult.error || 'Failed to fuse search results');
        }

        const fusedResults = fusionResult.results as SearchMatch[];
        const topResults = fusedResults.slice(0, 3); // Get top 3 results

        // Format the response
        const responseLines = ['Here are the most relevant passages I found:\n'];
        
        for (let i = 0; i < topResults.length; i++) {
          const match = topResults[i];
          const metadata = match.metadata as PdfMetadata;
          
          // Add a divider between results
          if (i > 0) {
            responseLines.push('───────────────────');
          }
          
          // Format each result with clear sections and sanitize the text
          responseLines.push(`📄 Result ${i + 1} (Page ${metadata.pageNumber})`);
          responseLines.push(`${sanitizeText(metadata.text)}\n`);
        }

        await respondWithMessage(responseLines.join('\n'));
      } catch (error) {
        console.error('Error searching PDF:', error);
        await respondWithMessage("An error occurred while searching the document. Please try again.");
      }

      break;
    }
    case 'ask':
      console.log('Executing PDF question:', queryText);
      break;
    default:
      console.log('Unknown command, defaulting to search:', queryText);
      break;
  }
}

async function handleUserMention(message: Message, mentionedUser: { userId: number, displayName: string, profilePicture: string | null }) {
  try {
    if (!message.channelId) {
      console.error('Cannot handle mention: missing channelId');
      return;
    }

    // Get the query by removing the mention
    const query = message.content.replace(new RegExp(`@${mentionedUser.displayName}\\s*`), '').trim();
    if (!query) {
      console.log('No query found after mention');
      return;
    }

    // Get Pinecone index
    const index = pinecone.index('slackers');

    // First, try to get the user's profile from the profiles namespace
    const traitsResults = await index.namespace('profiles').query({
      vector: await embeddings.embedQuery(`personality traits`),
      filter: { 
        type: { $eq: "personality-trait" },
        userId: { $eq: mentionedUser.userId.toString() }
      },
      topK: 10,
      includeMetadata: true
    });
    const writingStyleResults = await index.namespace('profiles').query({
      vector: await embeddings.embedQuery(`writing style`),
      filter: { 
        type: { $eq: "writing-style" },
        userId: { $eq: mentionedUser.userId.toString() }
      },
      topK: 10,
      includeMetadata: true
    });
    
    // Construct avatar config from query results
    const avatarConfig = {
      personalityTraits: traitsResults.matches?.map(match => match.metadata?.content as string).filter(Boolean) || ["helpful", "friendly"],
      writingStyle: writingStyleResults.matches?.[0]?.metadata?.content as string || "clear and concise",
      contextWindow: 100
    };

    // Create vector store for message history
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
      namespace: message.workspaceId.toString()
    });

    // Set up retriever with time and channel filters
    const retriever = vectorStore.asRetriever({
      filter: { 
        timestamp: {'$gt': Math.floor(new Date().getTime() / 1000) - (3600 * 48)}, // Last 48 hours
        channelId: {'$eq': message.channelId.toString()} 
      },
      k: avatarConfig.contextWindow,
    });

    // Set up the contextual question reformulation
    const contextualizeQSystemPrompt = `
    Given a chat history and the latest user question
    which might reference context in the chat history,
    formulate a standalone question which can be understood
    without the chat history. Do NOT answer the question, just
    reformulate it if needed and otherwise return it as is.`;

    const contextualizeQPrompt = ChatPromptTemplate.fromMessages([
      ["system", contextualizeQSystemPrompt],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
    ]);

    const historyAwareRetriever = await createHistoryAwareRetriever({
      llm,
      retriever,
      rephrasePrompt: contextualizeQPrompt,
    });

    // Set up the response generation
    const qaSystemPrompt = `
    You are acting as ${mentionedUser.displayName}'s AI avatar.
    Personality traits: ${avatarConfig.personalityTraits.join(", ")}
    Writing style: ${avatarConfig.writingStyle}

    Generate a response that matches their communication style, personality, and personal writing style.
    \n\n
    {context}`;

    const qaPrompt = ChatPromptTemplate.fromMessages([
      ["system", qaSystemPrompt],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
    ]);

    const questionAnswerChain = await createStuffDocumentsChain({
      llm,
      prompt: qaPrompt,
    });

    const ragChain = await createRetrievalChain({
      retriever: historyAwareRetriever,
      combineDocsChain: questionAnswerChain,
    });

    // Fetch the last 20 messages from either the channel or thread
    let recentMessages;
    if (message.parentMessageId) {
      // Get thread messages
      recentMessages = await db
        .select({
          messageId: messages.messageId,
          content: messages.content,
          userId: messages.userId,
          displayName: users.displayName,
          postedAt: messages.postedAt
        })
        .from(messages)
        .leftJoin(users, eq(messages.userId, users.userId))
        .where(and(
          eq(messages.parentMessageId, message.parentMessageId),
          eq(messages.workspaceId, message.workspaceId),
          eq(messages.deleted, false)
        ))
        .orderBy(desc(messages.postedAt))
        .limit(20);
    } else {
      // Get channel messages
      recentMessages = await db
        .select({
          messageId: messages.messageId,
          content: messages.content,
          userId: messages.userId,
          displayName: users.displayName,
          postedAt: messages.postedAt
        })
        .from(messages)
        .leftJoin(users, eq(messages.userId, users.userId))
        .where(and(
          eq(messages.channelId, message.channelId),
          eq(messages.workspaceId, message.workspaceId),
          isNull(messages.parentMessageId),
          eq(messages.deleted, false)
        ))
        .orderBy(desc(messages.postedAt))
        .limit(20);
    }

    // Convert messages to BaseMessage format
    const chat_history = recentMessages.reverse().map(msg => {
      const MessageClass = msg.userId === mentionedUser.userId ? AIMessage : HumanMessage;
      return new MessageClass({
        content: msg.content,
        name: msg.displayName || `User ${msg.userId}`
      });
    });
    console.log("CHAT HISTORY")
    console.log(chat_history)
    const response = await ragChain.invoke({
      chat_history,
      input: query,
    });

    // Create a new message from the AI response
    const now = new Date();
    const [botMessage] = await db.insert(messages)
      .values({
        workspaceId: message.workspaceId,
        channelId: message.channelId,
        userId: mentionedUser.userId,
        content: response.answer,
        parentMessageId: message.parentMessageId,
        hasAttachments: false,
        deleted: false,
        postedAt: now,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    // Broadcast the response via WebSocket
    const wsManager = getWebSocketManager();
    wsManager.broadcastToWorkspace(message.workspaceId, {
      type: "MESSAGE_CREATED",
      workspaceId: message.workspaceId,
      data: {
        messageId: botMessage.messageId,
        channelId: botMessage.channelId,
        content: botMessage.content,
        userId: botMessage.userId,
        workspaceId: botMessage.workspaceId,
        parentMessageId: botMessage.parentMessageId,
        hasAttachments: botMessage.hasAttachments,
        createdAt: botMessage.createdAt.toISOString(),
        replyCount: 0,
        user: {
          userId: mentionedUser.userId,
          displayName: mentionedUser.displayName,
          profilePicture: mentionedUser.profilePicture
        }
      }
    });

  } catch (error) {
    console.error(`Error generating AI response for user ${mentionedUser.userId}:`, error);
  }
}

/**
 * @route POST /channels/:channelId/messages
 * @desc Send a message in the channel
 */
router.post('/:channelId/messages', isAuthenticated, async (req: Request, res: Response) => {
  try {
    // Test Python script execution
    try {
      const pythonResult = await runPythonScript('test.py');
      console.log('Python script result:', pythonResult);
    } catch (error) {
      console.error('Error running Python script:', error);
    }

    const { channelId } = req.params;
    const validationResult = createMessageSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid Content",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid message data",
          errors: validationResult.error.errors
        }
      });
    }

    const { content, parentMessageId, identifier } = validationResult.data;
    // First get the channel to get its workspaceId
    const channel = await db.query.channels.findFirst({
      where: eq(channels.channelId, parseInt(channelId))
    });

    if (!channel || !channel.workspaceId) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "Channel not found"
        }
      });
    }

    // If parentMessageId is provided, verify it exists in the same workspace
    if (parentMessageId) {
      const parentMessage = await db.query.messages.findFirst({
        where: and(
          eq(messages.messageId, parentMessageId),
          eq(messages.workspaceId, channel.workspaceId)
        )
      });

      if (!parentMessage) {
        return res.status(404).json({
          error: "Parent Message Not Found",
          details: {
            code: "PARENT_MESSAGE_NOT_FOUND",
            message: "Parent message not found"
          }
        });
      }
    }

    const now = new Date();
    const hasAttachments = validationResult.data.hasAttachments || false;
    // Insert the message
    const [message] = await db.insert(messages)
      .values({
        workspaceId: channel.workspaceId,
        channelId: parseInt(channelId),
        userId: req.user!.userId,
        content,
        parentMessageId: parentMessageId || null,
        hasAttachments,
        deleted: false,
        postedAt: now,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    const wsManager = getWebSocketManager();

    // Get the user's display name
    const messageUser = await db.query.users.findFirst({
      where: eq(users.userId, req.user!.userId),
      columns: {
        displayName: true,
        profilePicture: true
      }
    });

    // Create the WebSocket event data
    const wsEventData = {
      type: "MESSAGE_CREATED" as const,
      workspaceId: channel.workspaceId,
      data: {
        messageId: message.messageId,
        channelId: message.channelId,
        content: message.content,
        userId: message.userId,
        workspaceId: message.workspaceId,
        parentMessageId: message.parentMessageId,
        hasAttachments: message.hasAttachments,
        createdAt: message.createdAt.toISOString(),
        identifier: identifier,
        replyCount: 0,
        user: {
          userId: message.userId,
          displayName: messageUser?.displayName || `User ${message.userId}`,
          profilePicture: messageUser?.profilePicture
        }
      }
    };

    // Broadcast with user info
    wsManager.broadcastToWorkspace(channel.workspaceId, wsEventData);

    // Handle mentions after the message is created and broadcast
    const mentionRegex = /@(\S+)/g;  // Match @ followed by non-whitespace characters
    const mentions = content.match(mentionRegex);

    if (mentions) {
      // Check if the first mention is PDFBot
      if (content.trimStart().startsWith('@PDFBot')) {
        await handlePDFBotCommand(message);
      } else {
        // Process other mentions as before
        for (const mention of mentions) {
          const displayName = mention.substring(1); // Remove the @ symbol

          // Skip PDFBot mentions that aren't at the start
          if (displayName === 'PDFBot') continue;

          // Find user in the workspace by display name
          const mentionedUser = await db
            .select({
              userId: users.userId,
              displayName: users.displayName,
              profilePicture: users.profilePicture
            })
            .from(users)
            .innerJoin(
              userWorkspaces,
              and(
                eq(userWorkspaces.userId, users.userId),
                eq(userWorkspaces.workspaceId, channel.workspaceId)
              )
            )
            .where(eq(users.displayName, displayName))
            .limit(1);

          if (mentionedUser.length > 0) {
            const user = mentionedUser[0];
            await handleUserMention(message, user);
          } else {
            console.log(`No user found with display name: ${displayName} in workspace ${channel.workspaceId}`);
          }
        }
      }
    }

    res.status(201).json(message);

    // Add message to Pinecone index
    try {
      // Generate embedding for the message
      const [embedding] = await embeddings.embedDocuments([message.content]);
      
      // Get Pinecone index
      const index = pinecone.index('slackers');
      
      // Prepare metadata
      const metadata: Record<string, string | number> = {
        timestamp: Math.floor(message.createdAt.getTime() / 1000),
        messageId: message.messageId.toString(),
        workspaceId: message.workspaceId.toString()
      };
      
      if (message.userId) {
        metadata.userId = message.userId.toString();
      }
      
      if (message.channelId) {
        metadata.channelId = message.channelId.toString();
      }

      // Upsert the vector to the workspace's namespace
      await index.namespace(message.workspaceId.toString()).upsert([{
        id: `msg_${message.messageId}`,
        values: embedding,
        metadata
      }]);
    } catch (error) {
      // Log error but don't fail the request since the message was already saved
      console.error('Error adding message to Pinecone index:', error);
    }
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to create message"
      }
    });
  }
});

/**
 * @route GET /channels/:channelId/messages
 * @desc List messages in a channel with pagination (excluded deleted unless requested)
 */
router.get('/:channelId/messages', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const before = req.query.before as string | undefined;
    const includeDeleted = req.query.includeDeleted === 'true';

    // Get channel first to verify it exists and get workspaceId
    const channel = await db.query.channels.findFirst({
      where: eq(channels.channelId, parseInt(channelId))
    });

    if (!channel) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "Channel not found"
        }
      });
    }

    let conditions = [
      eq(messages.channelId, parseInt(channelId)),
      eq(messages.workspaceId, channel.workspaceId!),
      isNull(messages.parentMessageId)
    ];

    if (!includeDeleted) {
      conditions.push(eq(messages.deleted, false));
    }

    if (before) {
      conditions.push(lt(messages.postedAt, new Date(before)));
    }

    // Modified query to include reply count and reactions
    const messagesList = await db
      .select({
        messageId: messages.messageId,
        channelId: messages.channelId,
        workspaceId: messages.workspaceId,
        userId: messages.userId,
        content: messages.content,
        parentMessageId: messages.parentMessageId,
        deleted: messages.deleted,
        hasAttachments: messages.hasAttachments,
        postedAt: messages.postedAt,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        displayName: users.displayName,
        profilePicture: users.profilePicture,
        replyCount: sql<number>`(
          SELECT COUNT(*)::integer 
          FROM "Messages" as replies
          WHERE replies."parentMessageId" = ${messages.messageId}
          AND replies."deleted" = false
        )`,
        reactions: sql<Record<string, number>>`(
          SELECT COALESCE(
            jsonb_object_agg("emojiId", "count"),
            '{}'::jsonb
          )
          FROM (
            SELECT "emojiId", COUNT(*) as "count"
            FROM "MessageReactions"
            WHERE "MessageReactions"."messageId" = ${messages.messageId}
            GROUP BY "emojiId"
          ) as reaction_counts
        )`
      })
      .from(messages)
      .leftJoin(users, eq(messages.userId, users.userId))
      .where(and(...conditions))
      .orderBy(desc(messages.postedAt))
      .limit(limit)
      .offset(offset);

    // Transform the results to include displayName in user object and parse reactions
    const formattedMessages = messagesList.map(message => {
      const { displayName, profilePicture, reactions, ...messageFields } = message;
      return {
        ...messageFields,
        reactions: reactions || {},
        user: {
          userId: message.userId,
          displayName: displayName || `User ${message.userId}`,
          profilePicture: profilePicture || null
        }
      };
    });
    
    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch messages"
      }
    });
  }
});

/**
 * @route GET /messages/:messageId
 * @desc Get message details (including soft-deleted if found)
 */
router.get('/:messageId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;

    const message = await db
      .select({
        messageId: messages.messageId,
        channelId: messages.channelId,
        workspaceId: messages.workspaceId,
        userId: messages.userId,
        content: messages.content,
        parentMessageId: messages.parentMessageId,
        deleted: messages.deleted,
        hasAttachments: messages.hasAttachments,
        postedAt: messages.postedAt,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        displayName: users.displayName,
        profilePicture: users.profilePicture,
        replyCount: sql<number>`(
          SELECT COUNT(*)::integer 
          FROM "Messages" 
          WHERE "parentMessageId" = ${messages.messageId} 
          AND "deleted" = false
        )`,
      })
      .from(messages)
      .leftJoin(users, eq(messages.userId, users.userId))
      .where(eq(messages.messageId, parseInt(messageId)))
      .limit(1);

    if (!message || message.length === 0) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "Message not found"
        }
      });
    }

    // Transform the result to include user info in a nested object
    const { displayName, profilePicture, ...messageFields } = message[0];
    const formattedMessage = {
      ...messageFields,
      user: {
        userId: message[0].userId,
        displayName: displayName || `User ${message[0].userId}`,
        profilePicture
      }
    };

    res.json(formattedMessage);
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch message"
      }
    });
  }
});

/**
 * @route PUT /messages/:messageId
 * @desc Update a message's content
 */
router.put('/:messageId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const validationResult = updateMessageSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid Content",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid message data",
          errors: validationResult.error.errors
        }
      });
    }

    const { content } = validationResult.data;

    // First get the message to verify ownership and get workspaceId
    const existingMessage = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!existingMessage || !existingMessage.workspaceId) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "Message not found"
        }
      });
    }

    // Check if message is deleted
    if (existingMessage.deleted) {
      return res.status(400).json({
        error: "Message Deleted",
        details: {
          code: "MESSAGE_DELETED",
          message: "Cannot update a deleted message"
        }
      });
    }

    // Verify user owns the message or has appropriate permissions
    if (existingMessage.userId !== req.user!.userId) {
      return res.status(403).json({
        error: "Forbidden",
        details: {
          code: "FORBIDDEN",
          message: "You don't have permission to edit this message"
        }
      });
    }

    const [message] = await db.update(messages)
      .set({
        content,
        updatedAt: new Date()
      })
      .where(and(
        eq(messages.messageId, parseInt(messageId)),
        eq(messages.workspaceId, existingMessage.workspaceId)
      ))
      .returning();

    res.json(message);

    

  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to update message"
      }
    });
  }
});

/**
 * @route DELETE /messages/:messageId
 * @desc Soft delete a message
 */
router.delete('/:messageId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;

    // First get the message to verify ownership and get workspaceId
    const existingMessage = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!existingMessage || !existingMessage.workspaceId) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "Message not found"
        }
      });
    }

    // Verify user owns the message or has appropriate permissions
    if (existingMessage.userId !== req.user!.userId) {
      return res.status(403).json({
        error: "Forbidden",
        details: {
          code: "FORBIDDEN",
          message: "You don't have permission to delete this message"
        }
      });
    }

    await db.update(messages)
      .set({
        deleted: true,
        updatedAt: new Date()
      })
      .where(and(
        eq(messages.messageId, parseInt(messageId)),
        eq(messages.workspaceId, existingMessage.workspaceId)
      ));

    // Remove message from Pinecone index
    try {
      const index = pinecone.index('slackers');
      await index.namespace(existingMessage.workspaceId.toString()).deleteOne(`msg_${messageId}`);
    } catch (error) {
      // Log error but don't fail the request since the message was already deleted from DB
      console.error('Error removing message from Pinecone index:', error);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to delete message"
      }
    });
  }
});

/**
 * @route GET /messages/:messageId/thread
 * @desc Get all replies in a thread
 */
router.get('/:messageId/thread', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const includeDeleted = req.query.includeDeleted === 'true';

    // First get the parent message to verify it exists and get channel info
    const parentMessage = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!parentMessage || !parentMessage.channelId) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "Parent message not found"
        }
      });
    }

    // Get the channel to check permissions
    const channel = await db.query.channels.findFirst({
      where: eq(channels.channelId, parentMessage.channelId)
    });

    if (!channel || !channel.workspaceId) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "Channel not found"
        }
      });
    }

    // Check if user is a member of the workspace
    const workspaceMembership = await db.query.userWorkspaces.findFirst({
      where: and(
        eq(userWorkspaces.workspaceId, channel.workspaceId),
        eq(userWorkspaces.userId, req.user!.userId)
      )
    });

    if (!workspaceMembership) {
      return res.status(404).json({
        error: "Not Found",
        details: {
          code: "NOT_FOUND",
          message: "Thread not found"
        }
      });
    }

    // If channel is not public, check channel membership
    if (channel.channelType !== 'PUBLIC') {
      const channelMembership = await db.query.userChannels.findFirst({
        where: and(
          eq(userChannels.channelId, channel.channelId),
          eq(userChannels.userId, req.user!.userId)
        )
      });

      if (!channelMembership) {
        return res.status(404).json({
          error: "Not Found",
          details: {
            code: "NOT_FOUND",
            message: "Thread not found"
          }
        });
      }
    }

    // Get all replies in the thread
    let conditions = [
      eq(messages.parentMessageId, parseInt(messageId)),
      eq(messages.workspaceId, channel.workspaceId)
    ];

    if (!includeDeleted) {
      conditions.push(eq(messages.deleted, false));
    }

    const threadMessages = await db
      .select({
        messageId: messages.messageId,
        channelId: messages.channelId,
        workspaceId: messages.workspaceId,
        userId: messages.userId,
        content: messages.content,
        parentMessageId: messages.parentMessageId,
        deleted: messages.deleted,
        hasAttachments: messages.hasAttachments,
        postedAt: messages.postedAt,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        displayName: users.displayName,
        profilePicture: users.profilePicture,
      })
      .from(messages)
      .leftJoin(users, eq(messages.userId, users.userId))
      .where(and(...conditions))
      .orderBy(desc(messages.postedAt));

    // Transform the results to include displayName in user object
    const formattedMessages = threadMessages.map(message => {
      const { displayName, profilePicture, ...messageFields } = message;
      return {
        ...messageFields,
        user: {
          userId: message.userId,
          displayName: displayName || `User ${message.userId}`,
          profilePicture: profilePicture || null
        }
      };
    });

    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching thread messages:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch thread messages"
      }
    });
  }
});

/**
 * @route POST /messages/:messageId/thread
 * @desc Post a reply in a thread
 */
router.post('/:messageId/thread', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const validationResult = createMessageSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid Content",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid message data",
          errors: validationResult.error.errors
        }
      });
    }

    const { content } = validationResult.data;

    // Get the parent message to verify it exists and get channel info
    const parentMessage = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!parentMessage || !parentMessage.channelId) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "Parent message not found"
        }
      });
    }

    // Get the channel to check permissions
    const channel = await db.query.channels.findFirst({
      where: eq(channels.channelId, parentMessage.channelId)
    });

    if (!channel || !channel.workspaceId) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "Channel not found"
        }
      });
    }

    // Check if user is a member of the workspace
    const workspaceMembership = await db.query.userWorkspaces.findFirst({
      where: and(
        eq(userWorkspaces.workspaceId, channel.workspaceId),
        eq(userWorkspaces.userId, req.user!.userId)
      )
    });

    if (!workspaceMembership) {
      return res.status(403).json({
        error: "Forbidden",
        details: {
          code: "FORBIDDEN",
          message: "You don't have permission to reply in this thread"
        }
      });
    }

    // If channel is not public, check channel membership
    if (channel.channelType !== 'PUBLIC') {
      const channelMembership = await db.query.userChannels.findFirst({
        where: and(
          eq(userChannels.channelId, channel.channelId),
          eq(userChannels.userId, req.user!.userId)
        )
      });

      if (!channelMembership) {
        return res.status(403).json({
          error: "Forbidden",
          details: {
            code: "FORBIDDEN",
            message: "You don't have permission to reply in this thread"
          }
        });
      }
    }

    const now = new Date();

    // Insert the reply
    const [message] = await db.insert(messages)
      .values({
        workspaceId: channel.workspaceId,
        channelId: parentMessage.channelId,
        userId: req.user!.userId,
        content,
        parentMessageId: parseInt(messageId),
        deleted: false,
        postedAt: now,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    const wsManager = getWebSocketManager();

    // Get the user's display name
    const messageUser = await db.query.users.findFirst({
      where: eq(users.userId, req.user!.userId),
      columns: {
        displayName: true,
        profilePicture: true
      }
    });

    // Broadcast with user info
    wsManager.broadcastToWorkspace(channel.workspaceId, {
      type: "MESSAGE_CREATED" as const,
      workspaceId: channel.workspaceId,
      data: {
        messageId: message.messageId,
        channelId: message.channelId,
        content: message.content,
        userId: message.userId,
        workspaceId: message.workspaceId,
        parentMessageId: message.parentMessageId,
        hasAttachments: message.hasAttachments,
        createdAt: message.createdAt.toISOString(),
        replyCount: 0,
        user: {
          userId: message.userId,
          displayName: messageUser?.displayName || `User ${message.userId}`,
          profilePicture: messageUser?.profilePicture
        }
      }
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Error creating thread reply:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to create thread reply"
      }
    });
  }
});

export { router as messageRouter };