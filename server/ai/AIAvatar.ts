import 'dotenv/config';
import { Index, Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { Document } from "langchain/document";
import { PineconeStore } from "@langchain/pinecone";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { BaseMessage } from "@langchain/core/messages";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { getWebSocketManager } from '../websocket/WebSocketManager';
import type { Message } from "@db/schema";

// Types for our domain
// interface Message {
//   messageId: number;
//   content: string;
//   userId: number;
//   channelId: number;
//   workspaceId: number;
//   parentMessageId?: number;
//   postedAt: string;
//   createdAt: string;
//   updatedAt: string;
//   user?: {
//     userId: number;
//     displayName: string;
//     profilePicture?: string | null;
//   };
// }

interface AvatarConfig {
  userId: number;
  personalityTraits: string[];
  responseStyle: string;
  writingStyle: string;
  contextWindow: number;
}

export class AIAvatarService {
  private static instance: AIAvatarService;
  private pineconeClient: PineconeClient;
  private embeddings: OpenAIEmbeddings;
  private llm: ChatOpenAI;
  private indexName = "rag-project-index";
  private index: Index;
  private vectorStore: PineconeStore | null;
  private initialized: boolean = false;

  private constructor() {
    this.pineconeClient = new PineconeClient({
      apiKey: process.env.PINECONE_API_KEY!,
    });
    this.embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-large",
      dimensions: 3072,
    });
    this.llm = new ChatOpenAI({
      temperature: 0.7,
      modelName: "gpt-4o-mini",
    });
    this.index = this.pineconeClient.Index(this.indexName);
    this.vectorStore = null;
  }

  public static getInstance(): AIAvatarService {
    if (!AIAvatarService.instance) {
      AIAvatarService.instance = new AIAvatarService();
    }
    return AIAvatarService.instance;
  }

  async initialize() {
    if (!this.initialized) {
      this.vectorStore = await PineconeStore.fromExistingIndex(this.embeddings, {
        pineconeIndex: this.index,
      });
      this.initialized = true;
    }
  }

  async indexUserMessage(message: Message): Promise<void> {
    if (!this.initialized) await this.initialize();
    
    if (!message.userId || !message.channelId) {
      console.error('Cannot index message: missing userId or channelId');
      return;
    }
    
    const doc = new Document({
      id: `msg_${message.messageId}`,
      pageContent: `[User ${message.userId}] ${message.content}`,
      metadata: {
        userId: message.userId.toString(),
        timestamp: Math.floor(new Date(message.createdAt).getTime() / 1000),
        channelId: message.channelId.toString(),
      },
    });

    await this.vectorStore!.addDocuments([doc], [`msg_${message.messageId}`]);
  }

  async createAvatarPersona(userId: number): Promise<AvatarConfig> {
    if (!this.initialized) await this.initialize();

    const userMessages = await this.vectorStore!.similaritySearch("", 100, { userId: {'$eq': userId.toString()} });

    const prompt = `
      Analyze these messages and create a detailed persona description:
      ${userMessages.map((msg) => msg.pageContent).join("\n")}

      Focus on:
      1. Communication style
      2. Typical responses
      3. Common phrases
      4. Tone and sentiment
      5. Knowledge areas
      6. Writing style

      The goal of this persona creation is to help the AI generate a unique and personalized response in the voice of the user. Writing style should include grammar, punctuation, and style.

      Output should be a JSON object with the following format:
      {
        "personalityTraits": ["personalityTrait1", "personalityTrait2", ...],
        "responseStyle": "responseStyle",
        "writingStyle": "writingStyle",
      }
    `;

    const jsonLlm = this.llm.bind({ response_format: { type: "json_object" } });
    const response = await jsonLlm.invoke(prompt);
    const content = typeof response.content === "string" ? JSON.parse(response.content) : response.content;
    return {userId: userId, contextWindow: 100, personalityTraits: content.personalityTraits, responseStyle: content.responseStyle, writingStyle: content.writingStyle};
  }

  async configureAvatar(config: AvatarConfig): Promise<void> {
    if (!this.initialized) await this.initialize();

    const jsonConfig = JSON.stringify(config);
    await this.index.upsert([
      {
        id: `avatar-config-${config.userId}`,
        values: await this.embeddings.embedQuery(jsonConfig),
        metadata: {
          type: "avatar-config",
          userId: config.userId.toString(),
          config: jsonConfig,
        },
      },
    ]);
  }

  async generateAvatarResponse(
    userId: number,
    message: Message,
  ): Promise<string> {
    if (!this.initialized) await this.initialize();
    if (!message.channelId) throw new Error('Cannot generate response: missing channelId');

    const channelId = message.channelId.toString();
    
    var configQuery = await this.vectorStore!.similaritySearch(
      `avatar-config-${userId}`,
      1,
      { type: "avatar-config", userId: {'$eq': userId!.toString()} },
    );

    if (configQuery.length === 0) {
      const persona = await this.createAvatarPersona(userId);
      await this.configureAvatar(persona);
      configQuery = await this.vectorStore!.similaritySearch(
        `avatar-config-${userId}`,
        1,
        { type: "avatar-config", userId: {'$eq': userId!.toString()} },
      );
    }
    const avatarConfig: AvatarConfig = JSON.parse(configQuery[0].metadata.config);

    const llm = this.llm;
    const retriever = this.vectorStore!.asRetriever({
      filter: { 
        timestamp: {'$gt': Math.floor(new Date(message.createdAt).getTime() / 1000) - (3600 * 48)}, 
        channelId: {'$eq': channelId} 
      },
      k: avatarConfig.contextWindow,
    });

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

    const qaSystemPrompt = `
        You are acting as [User ${userId}]'s AI avatar.
        Personality traits: ${avatarConfig.personalityTraits.join(", ")}
        Response style: ${avatarConfig.responseStyle}
        Writing style: ${avatarConfig.writingStyle}

        Generate a response that matches their communication style, personality, and personal writing style.'
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

    const chat_history: BaseMessage[] = [];
    const response = await ragChain.invoke({
      chat_history,
      input: message.content,
    });
    return response.answer;
  }

  // Handle user mentions and generate AI responses
  async handleUserMention(mentionedUserId: number, message: Message): Promise<void> {
    try {
      if (!message.channelId) {
        console.error('Cannot handle mention: missing channelId');
        return;
      }

      const response = await this.generateAvatarResponse(mentionedUserId, message);
      
      // Create a new message from the AI response
      const wsManager = getWebSocketManager();
      const channelId = message.channelId as number; // Type assertion since we've checked for null
      wsManager.broadcastToWorkspace(message.workspaceId, {
        type: 'MESSAGE_CREATED',
        workspaceId: message.workspaceId,
        data: {
          messageId: -Date.now(), // Temporary ID, will be replaced by the actual message ID
          channelId,
          workspaceId: message.workspaceId,
          userId: mentionedUserId,
          content: response,
          createdAt: new Date().toISOString(),
          postedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          parentMessageId: null,
          hasAttachments: false,
          deleted: false,
          user: {
            userId: mentionedUserId,
            displayName: `AI Avatar (User ${mentionedUserId})`,
            profilePicture: null
          }
        }
      });
    } catch (error) {
      console.error(`Error generating AI response for user ${mentionedUserId}:`, error);
    }
  }
} 