import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { z } from 'zod';
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";

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

// Input validation schema
const updateProfileSchema = z.object({
  personalityTraits: z.array(z.string().min(1, "Personality trait cannot be empty")),
  writingStyle: z.string().min(1, "Writing style cannot be empty")
});

/**
 * Helper function to safely delete a vector
 */
async function safeDeleteVector(namespace: any, vectorId: string) {
  try {
    await namespace.deleteOne(vectorId);
  } catch (error: any) {
    // Ignore 404 errors as they just mean the vector didn't exist
    if (error?.name !== 'PineconeNotFoundError') {
      throw error;
    }
  }
}

/**
 * @route GET /ai/profile
 * @desc Get AI profile for a user
 */
router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.userId;

    // Get Pinecone index
    const index = pinecone.index('slackers');
    const profilesNamespace = index.namespace('profiles');

    // Fetch vectors for the user
    const response = await profilesNamespace.fetch([`style_${userId}`]);

    // Initialize response data
    let writingStyle = '';
    const personalityTraits: string[] = [];

    // Extract writing style if found
    const styleRecord = response.records[`style_${userId}`];
    if (styleRecord?.metadata) {
      writingStyle = String(styleRecord.metadata.content || '');
    }

    // Fetch all trait vectors (we'll try up to index 99 to be safe)
    const traitIds = Array.from({ length: 100 }, (_, i) => `trait_${userId}_${i}`);
    const traitsResponse = await profilesNamespace.fetch(traitIds);

    // Extract personality traits
    Object.values(traitsResponse.records).forEach(record => {
      if (record?.metadata?.type === 'personality-trait' && record.metadata.content) {
        personalityTraits.push(String(record.metadata.content));
      }
    });

    res.status(200).json({
      personalityTraits,
      writingStyle
    });

  } catch (error) {
    console.error('Error fetching AI profile:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch AI profile"
      }
    });
  }
});

/**
 * @route POST /ai/profile
 * @desc Update AI profile for a user
 */
router.post('/profile', isAuthenticated, async (req, res) => {
  try {
    // Validate request body
    const validationResult = updateProfileSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid Content",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid profile data",
          errors: validationResult.error.errors
        }
      });
    }

    const { personalityTraits, writingStyle } = validationResult.data;
    const userId = req.user!.userId;

    // Get Pinecone index
    const index = pinecone.index('slackers');
    const profilesNamespace = index.namespace('profiles');

    // Clean up existing profile entries
    try {
      // Delete trait vectors
      for (let i = 0; i < 100; i++) { // Reasonable upper limit
        await safeDeleteVector(profilesNamespace, `trait_${userId}_${i}`);
      }
      // Delete writing style vector
      await safeDeleteVector(profilesNamespace, `style_${userId}`);
    } catch (error) {
      console.error('Error cleaning up existing vectors:', error);
      // Continue with upsert even if cleanup fails
    }

    // Generate embeddings for personality traits
    const traitEmbeddings = await embeddings.embedDocuments(personalityTraits);
    
    // Generate embedding for writing style
    const [writingStyleEmbedding] = await embeddings.embedDocuments([writingStyle]);

    // Prepare vectors for personality traits
    const traitVectors = personalityTraits.map((trait, i) => ({
      id: `trait_${userId}_${i}`,
      values: traitEmbeddings[i],
      metadata: {
        userId: userId.toString(),
        type: 'personality-trait',
        content: trait
      }
    }));

    // Prepare vector for writing style
    const writingStyleVector = {
      id: `style_${userId}`,
      values: writingStyleEmbedding,
      metadata: {
        userId: userId.toString(),
        type: 'writing-style',
        content: writingStyle
      }
    };

    // Combine all vectors
    const vectors = [...traitVectors, writingStyleVector];

    // Upsert all vectors to the profiles namespace
    await profilesNamespace.upsert(vectors);

    res.status(200).json({
      message: "AI profile updated successfully",
      traits: personalityTraits.length,
      hasWritingStyle: true
    });

  } catch (error) {
    console.error('Error updating AI profile:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to update AI profile"
      }
    });
  }
});

export { router as aiRouter }; 