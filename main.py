# filename: main.py

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles # New import for serving static files
import uvicorn
import sqlite3
import networkx as nx
from typing import Dict, List, Any, Tuple
import requests
import json
import re

# ==============================================================================
# Part 1: Schema Representation as a Metagraph
# This class represents the database schema as a graph.
# ==============================================================================
class SchemaMetagraph:
    """
    Represents the database schema as a metagraph where nodes can be tables,
    columns, or other entities, and edges represent relationships.
    """
    def __init__(self, schema_dict: Dict[str, Any]):
        self.graph = nx.DiGraph()
        self.schema_dict = schema_dict
        self._build_metagraph()

    def _build_metagraph(self):
        """
        Constructs the graph from the schema dictionary.
        """
        print("Building schema metagraph...")
        
        # Add table nodes and column nodes
        try:
            for table_name, table_info in self.schema_dict['tables'].items():
                self.graph.add_node(table_name, type='table')
                for column_name in table_info['columns']:
                    node_name = f"{table_name}.{column_name}"
                    self.graph.add_node(node_name, type='column', table=table_name)
                    self.graph.add_edge(node_name, table_name, type='contains')
        except AttributeError:
            print("ERROR: self.schema_dict['tables'] is not a dictionary. Check schema introspection logic.")
            raise

        # Add relationship edges (foreign keys)
        for rel in self.schema_dict.get('relationships', []):
            from_node = f"{rel['from_table']}.{rel['from_col']}"
            to_node = f"{rel['to_table']}.{rel['to_col']}"
            if self.graph.has_node(from_node) and self.graph.has_node(to_node):
                self.graph.add_edge(from_node, to_node, type='fk')
                self.graph.add_edge(to_node, from_node, type='fk_reverse')

        print("Metagraph built successfully.")

    def get_related_nodes(self, node: str) -> List[str]:
        """Returns a list of nodes directly connected to a given node."""
        return list(self.graph.neighbors(node))

# ==============================================================================
# Part 2: Dynamic Schema Introspection
# This function connects to the database and builds the schema dictionary.
# ==============================================================================
def get_dynamic_schema(db_path: str) -> Dict[str, Any]:
    """
    Connects to a SQLite database and dynamically introspects its schema.
    Returns a dictionary in the format expected by the SchemaMetagraph.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    schema = {'tables': {}, 'relationships': []}

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    table_names = [row[0] for row in cursor.fetchall()]

    for table_name in table_names:
        cursor.execute(f"PRAGMA table_info('{table_name}');")
        columns = [row[1] for row in cursor.fetchall()]
        schema['tables'][table_name] = {'columns': columns}

        cursor.execute(f"PRAGMA foreign_key_list('{table_name}');")
        foreign_keys = cursor.fetchall()
        for fk in foreign_keys:
            to_table = fk[2]
            from_col = fk[3]
            to_col = fk[4]
            schema['relationships'].append({
                'from_table': table_name,
                'from_col': from_col,
                'to_table': to_table,
                'to_col': to_col
            })
    conn.close()
    return schema

# ==============================================================================
# Part 3: Natural Language Query Processor
# This is a simple tokenizer for the natural language query.
# ==============================================================================
class QueryProcessor:
    """
    A simple processor to extract keywords from a natural language query.
    """
    def __init__(self, query: str):
        self.query = query.lower()
        self.tokens = self.query.split()

    def get_keywords(self) -> List[str]:
        """
        Returns a list of potential keywords from the query.
        """
        stop_words = {'a', 'an', 'the', 'is', 'of', 'in', 'and', 'or', 'for', 'show', 'list', 'what', 'how', 'many', 'count', 'get', 'total'}
        return [token for token in self.tokens if token not in stop_words]

# ==============================================================================
# Part 4: The Metagraph Augmented Generator
# This class uses an LLM and the metagraph to generate the SQL query.
# ==============================================================================
class MetagraphAugmentedGenerator:
    """
    The core generation component. It uses the SchemaMetagraph to augment
    the natural language query with relevant schema information.
    """
    def __init__(self, metagraph: SchemaMetagraph):
        self.metagraph = metagraph

    async def generate_sql(self, natural_language_query: str) -> Tuple[str, List[str]]:
        """
        Generates a SQL query from a natural language query using the metagraph
        and returns the query along with the list of relevant nodes.
        """
        print(f"Processing query: '{natural_language_query}'")

        # Step 1: Process the natural language query to get keywords
        query_processor = QueryProcessor(natural_language_query)
        keywords = query_processor.get_keywords()
        print(f"Extracted keywords: {keywords}")

        # Step 2: Use the metagraph to find relevant schema elements based on keywords
        relevant_schema_nodes = set()
        for keyword in keywords:
            for node in self.metagraph.graph.nodes:
                if keyword.lower() in node.lower():
                    relevant_schema_nodes.add(node)
                    relevant_schema_nodes.update(self.metagraph.get_related_nodes(node))

        print(f"Relevant schema elements found: {list(relevant_schema_nodes)}")
        
        # Step 3: Augment the prompt for the LLM
        schema_context = f"Relevant schema information: {list(relevant_schema_nodes)}"
        prompt = f"""
        You are a text-to-SQL conversion model.
        Convert the following natural language query to a SQL query based on the Northwind database.
        Use the provided schema context to help you.

        Schema Context:
        {schema_context}

        Natural Language Query:
        {natural_language_query}

        SQL Query:
        """
        
        # Step 4: Call the LLM to generate the SQL using the Gemini API
        try:
            chatHistory = []
            chatHistory.append({ "role": "user", "parts": [{ "text": prompt }] })
            payload = { "contents": chatHistory }
            apiKey = "AIzaSyBcb0Mf1kBaEOcz5F2fOSQUPHE64d5ssHQ"
            
            # Use requests to make the API call
            apiUrl = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={apiKey}"
            
            response = requests.post(apiUrl, headers={'Content-Type': 'application/json'}, json=payload)
            response.raise_for_status() # Raise an exception for bad status codes
            result = response.json()
            
            if result.get('candidates') and result['candidates'][0].get('content') and result['candidates'][0]['content'].get('parts'):
                sql_query = result['candidates'][0]['content']['parts'][0]['text']
                
                # Clean the SQL query from Markdown fences and whitespace
                clean_sql_query = re.sub(r'```sql\n(.*)```', r'\1', sql_query, flags=re.DOTALL).strip()
                
                return clean_sql_query, list(relevant_schema_nodes)
            else:
                return "SELECT 'API response was empty or malformed.';", []
        
        except requests.exceptions.RequestException as e:
            print(f"Error calling LLM API: {e}")
            return "SELECT 'Error generating query. Please ensure you are connected to the internet and have a valid API key if needed.';", []
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            return "SELECT 'An unexpected error occurred. Please try again later.';", []

# ==============================================================================
# Part 5: Initializing the System and FastAPI
# ==============================================================================
app = FastAPI()

# Add a health check endpoint for Render.
# This will prevent the server from being shut down due to a failed health check.
@app.get("/health")
def health_check():
    """
    A simple health check endpoint.
    Render's health check will hit this endpoint to ensure the application is running.
    """
    return {"status": "ok"}


# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize metagraph and generator
metagraph = None
generator = None
northwind_schema = None
try:
    # This is the correct dynamic schema fetching
    northwind_schema = get_dynamic_schema('northwind.db')
    print("Dynamically generated schema:")
    print(northwind_schema)
    metagraph = SchemaMetagraph(northwind_schema)
    generator = MetagraphAugmentedGenerator(metagraph)
except Exception as e:
    print(f"Error during schema introspection or metagraph initialization: {e}")
    raise HTTPException(status_code=500, detail=f"Server failed to initialize: {e}")

# ==============================================================================
# Part 6: API Endpoints
# ==============================================================================
class QueryPayload(BaseModel):
    query: str

# Mount the static files from the 'static' directory (the frontend build)
# This serves all the CSS, JS, and image files for your frontend.
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def serve_frontend():
    """
    Serves the main index.html file for the single-page application.
    """
    return FileResponse("static/index.html")

@app.get("/get_schema")
async def get_schema():
    """
    New API endpoint to return the dynamically generated database schema.
    This will be used by the frontend for visualization.
    """
    if not northwind_schema:
        raise HTTPException(status_code=500, detail="Schema not initialized.")
    return northwind_schema

@app.post("/generate_sql_and_data")
async def generate_sql_and_data_endpoint(payload: QueryPayload):
    """
    API endpoint to receive a natural language query, generate a SQL query,
    execute it against the Northwind database, and return the results.
    """
    if not generator:
        raise HTTPException(status_code=500, detail="Server initialization failed. Check backend logs.")
    try:
        sql_query, relevant_nodes = await generator.generate_sql(payload.query)

        conn = sqlite3.connect('northwind.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        print(f"Executing SQL: {sql_query}")
        cursor.execute(sql_query)
        rows = cursor.fetchall()
        
        results = []
        for row in rows:
            row_dict = dict(row)
            if 'Photo' in row_dict:
                del row_dict['Photo']
            results.append(row_dict)
        
        conn.close()

        return {"sql_query": sql_query, "data": results, "relevant_nodes": relevant_nodes}

    except sqlite3.OperationalError as e:
        print(f"SQL Execution Error: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid SQL Query: {e}")
    except Exception as e:
        print(f"An error occurred: {e}")
        raise HTTPException(status_code=500, detail=f"Server error: {e}")

# ==============================================================================
# Part 7: Main execution
# ==============================================================================
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

