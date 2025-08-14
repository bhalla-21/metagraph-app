# filename: generator.py

import networkx as nx
from typing import Dict, List, Any
import requests
import json
import os
import time
import re

# We'll import SchemaMetagraph from the metagraph file later in main.py
# For this file to be runnable on its own, we'll define a dummy class.
try:
    from metagraph import SchemaMetagraph
except ImportError:
    class SchemaMetagraph:
        def __init__(self, schema_dict):
            self.graph = nx.DiGraph()
            self.schema_dict = schema_dict
        def get_related_nodes(self, node):
            return []

# ==============================================================================
# Part 2: Natural Language Query Processor
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
# Part 3: The Metagraph Augmented Generator
# This class uses an LLM and the metagraph to generate the SQL query.
# The mock logic has been replaced with a function that simulates a call to an LLM.
# ==============================================================================
class MetagraphAugmentedGenerator:
    """
    The core generation component. It uses the SchemaMetagraph to augment
    the natural language query with relevant schema information.
    """
    def __init__(self, metagraph: SchemaMetagraph):
        self.metagraph = metagraph

    async def generate_sql(self, natural_language_query: str) -> str:
        """
        Generates a SQL query from a natural language query using the metagraph.
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
                if keyword in node.lower():
                    relevant_schema_nodes.add(node)
                    relevant_schema_nodes.update(self.metagraph.get_related_nodes(node))

        print(f"Relevant schema elements found: {list(relevant_schema_nodes)}")
        
        # Step 3: Augment the prompt for the LLM with a structured schema context
        schema_context = self._build_schema_context(relevant_schema_nodes)
        
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
            
            # Implement exponential backoff for retries
            for i in range(3):
                try:
                    response = requests.post(apiUrl, headers={'Content-Type': 'application/json'}, json=payload, timeout=60)
                    response.raise_for_status() # Raise an exception for bad status codes
                    break
                except requests.exceptions.RequestException as e:
                    print(f"API call failed, retry {i+1}/3: {e}")
                    time.sleep(2 ** i)
            else:
                raise requests.exceptions.RequestException("Max retries exceeded.")
            
            result = response.json()
            
            if result.get('candidates') and result['candidates'][0].get('content') and result['candidates'][0]['content'].get('parts'):
                sql_query = result['candidates'][0]['content']['parts'][0]['text']
                
                # Use a regular expression to clean the SQL query, removing
                # the Markdown fences and any surrounding whitespace.
                clean_sql_query = re.sub(r'```sql\n(.*)```', r'\1', sql_query, flags=re.DOTALL).strip()
                
                return clean_sql_query
            else:
                return "SELECT 'API response was empty or malformed.';"
        
        except requests.exceptions.RequestException as e:
            print(f"Error calling LLM API: {e}")
            return "SELECT 'Error generating query. Please ensure you are connected to the internet and have a valid API key if needed.';"
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            return "SELECT 'An unexpected error occurred. Please try again later.';"
            
    def _build_schema_context(self, relevant_nodes: set) -> str:
        """
        Builds a human-readable, structured string of schema information
        from a set of relevant nodes.
        """
        tables_to_describe = set()
        for node in relevant_nodes:
            # Check if the node is a table or a column
            if '.' in node:
                table_name = node.split('.')[0]
                tables_to_describe.add(table_name)
            else:
                tables_to_describe.add(node)
                
        context_string = ""
        for table_name in tables_to_describe:
            # Check if the table exists in the schema dict
            if table_name in self.metagraph.schema_dict['tables']:
                table_info = self.metagraph.schema_dict['tables'][table_name]
                context_string += f"Table: {table_name}\n"
                
                # Add table description if available
                if 'description' in table_info:
                    context_string += f"Description: {table_info['description']}\n"
                
                context_string += "Columns:\n"
                for col_name, col_info in table_info['columns'].items():
                    # Check if the column is in the relevant nodes set
                    if f"{table_name}.{col_name}" in relevant_nodes or table_name in relevant_nodes:
                        context_string += f"  - {col_name} ({col_info['type']}): {col_info['description']}\n"
                        
                context_string += "\n"
        
        # Add relationships for a more complete context
        relationships = self.metagraph.schema_dict.get('relationships', [])
        if relationships:
            context_string += "Relationships:\n"
            for rel in relationships:
                context_string += f"  - {rel['from_table']}.{rel['from_col']} connects to {rel['to_table']}.{rel['to_col']}\n"
            context_string += "\n"

        return context_string
