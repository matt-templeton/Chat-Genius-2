from langchain_openai import ChatOpenAI, OpenAIEmbeddings
# from langchain_pinecone import PineconeVectorStore
from langchain_core.output_parsers import StrOutputParser
from dotenv import load_dotenv
import os
import sys
import json
from langchain import hub
from langchain.load import dumps, loads
load_dotenv()

def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({
            'error': 'No filename provided'
        }))
        sys.exit(1)
    generate_rag_fusion_queries(sys.argv[1])
    return 0


def reciprocal_rank_fusion(results: list[list], k=60):
    fused_scores = {}
    for docs in results:
        # Assumes the docs are returned in sorted order of relevance
        for rank, doc in enumerate(docs):
            doc_str = dumps(doc)
            if doc_str not in fused_scores:
                fused_scores[doc_str] = 0
            previous_score = fused_scores[doc_str]
            fused_scores[doc_str] += 1 / (rank + k)

    reranked_results = [
        (loads(doc), score)
        for doc, score in sorted(fused_scores.items(), key=lambda x: x[1], reverse=True)
    ]
    return reranked_results

def generate_rag_fusion_queries(user_query: str) -> list[str]:
    """
    Generate multiple search queries using RAG fusion technique.
    Uses LangChain's specialized prompt from their hub to enhance the original query.
    
    Args:
        user_query (str): The original user query
        
    Returns:
        list[str]: List of generated search queries
    """
    try:
        # Get the specialized prompt from LangChain hub
        prompt = hub.pull("langchain-ai/rag-fusion-query-generation")
    
        # Create the query generation chain
        generate_queries = (
            prompt | 
            ChatOpenAI(temperature=0) | 
            StrOutputParser() | 
            (lambda x: x.split("\n"))
        )
        
        # Generate the enhanced queries
        queries = generate_queries.invoke({"original_query": user_query})
        
        print(json.dumps({'success': True, 'queries': queries}))
    except Exception as e:
        print(json.dumps({
            'error': str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    sys.exit(main())