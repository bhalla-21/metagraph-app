# filename: metagraph.py

import networkx as nx
from typing import Dict, List, Any

# ==============================================================================
# Part 1: Schema Representation as a Metagraph
# This class represents the database schema as a graph. Nodes are tables and
# columns, and edges represent relationships (e.g., foreign keys, column-to-table).
# ==============================================================================
class SchemaMetagraph:
    """
    Represents the database schema as a metagraph where nodes can be tables,
    columns, or other entities, and edges represent relationships.
    """
    def __init__(self, schema_dict: Dict[str, Any]):
        """
        Initializes the metagraph from a dictionary representation of the schema.

        Args:
            schema_dict (Dict[str, Any]): A dictionary describing the database schema.
        """
        self.graph = nx.DiGraph()
        self.schema_dict = schema_dict
        self._build_metagraph()

    def _build_metagraph(self):
        """
        Constructs the graph from the schema dictionary.
        This is where we define the relationships between tables and columns.
        """
        print("Building schema metagraph...")

        # Add table nodes to the graph
        for table_name in self.schema_dict['tables']:
            self.graph.add_node(table_name, type='table')

        # Add column nodes and connect them to their parent table
        for table_name, table_info in self.schema_dict['tables'].items():
            for column_name in table_info['columns']:
                node_name = f"{table_name}.{column_name}"
                self.graph.add_node(node_name, type='column', table=table_name)
                # Add a directed edge from the column to the table it belongs to
                self.graph.add_edge(node_name, table_name, type='contains')

        # Add relationship edges (e.g., foreign keys) between columns in different tables
        for rel in self.schema_dict.get('relationships', []):
            from_node = f"{rel['from_table']}.{rel['from_col']}"
            to_node = f"{rel['to_table']}.{rel['to_col']}"
            if self.graph.has_node(from_node) and self.graph.has_node(to_node):
                self.graph.add_edge(from_node, to_node, type='fk')
                self.graph.add_edge(to_node, from_node, type='fk_reverse')

        print("Metagraph built successfully.")

    def get_related_nodes(self, node: str) -> List[str]:
        """
        Returns a list of nodes directly connected to a given node.
        This will be useful later for providing context to the LLM.
        """
        return list(self.graph.neighbors(node))

    def get_graph_data_for_json(self) -> Dict[str, List[Dict[str, str]]]:
        """
        Exports the graph data in a JSON-friendly format for visualization.
        Returns a dictionary with 'nodes' and 'links' lists.
        """
        nodes = []
        for node, data in self.graph.nodes(data=True):
            nodes.append({"id": node, "type": data.get("type"), "table": data.get("table")})

        links = []
        for u, v, data in self.graph.edges(data=True):
            links.append({"source": u, "target": v, "type": data.get("type")})
        
        return {"nodes": nodes, "links": links}
