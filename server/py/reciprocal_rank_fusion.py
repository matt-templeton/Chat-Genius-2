import sys
import json
from langchain.load import dumps, loads

def reciprocal_rank_fusion(results: list[list], k: int = 60):
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
        loads(doc)
        for doc, score in sorted(fused_scores.items(), key=lambda x: x[1], reverse=True)
    ]
    return reranked_results

def main() -> int:
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        
        if not isinstance(input_data, list):
            raise ValueError("Input must be a list of result lists")
            
        # Process the results
        fused_results = reciprocal_rank_fusion(input_data)
        
        # Return the fused results
        print(json.dumps({
            'success': True,
            'results': fused_results
        }))
        return 0
        
    except Exception as e:
        print(json.dumps({
            'error': str(e)
        }))
        return 1

if __name__ == "__main__":
    sys.exit(main()) 