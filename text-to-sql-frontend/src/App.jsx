import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';

// The API base URL is now an empty string. This tells the frontend
// to make API calls to the same server it was loaded from,
// which is your Python backend.
const API_BASE_URL = 'https://metagraph-app.onrender.com';

const App = () => {
  // State for user input and API responses
  const [query, setQuery] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [data, setData] = useState([]);
  const [relevantNodes, setRelevantNodes] = useState([]);
  const [schemaData, setSchemaData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isVisLoaded, setIsVisLoaded] = useState(false);

  // Ref for the visualization container
  const visRef = useRef(null);
  const visNetworkRef = useRef(null);

  // ==============================================================================
  // Part 1: Dynamically load vis-network from CDN
  // ==============================================================================
  useEffect(() => {
    // Dynamically load the vis-network library from a CDN
    const loadVisJs = () => {
      if (window.vis && window.vis.Network) {
        setIsVisLoaded(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/vis-network@9.1.2/dist/vis-network.min.js';
      script.onload = () => {
        setIsVisLoaded(true);
        console.log("Vis.js loaded successfully.");
      };
      script.onerror = () => {
        console.error("Failed to load Vis.js");
      };
      document.head.appendChild(script);
    };
    loadVisJs();
  }, []);

  // ==============================================================================
  // Part 2: Fetching the initial schema on component mount
  // ==============================================================================
  useEffect(() => {
    if (!isVisLoaded) return;

    const fetchSchema = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/get_schema`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const schema = await response.json();
        console.log("Schema fetched:", schema);
        setSchemaData(schema);
      } catch (err) {
        console.error("Error fetching schema:", err);
        setError("Error fetching schema. Please ensure the backend is running.");
      }
    };
    fetchSchema();
  }, [isVisLoaded]); // Fetch schema only after Vis.js is loaded

  // ==============================================================================
  // Part 3: Handling query submission
  // ==============================================================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query) return;

    setIsLoading(true);
    setError(null);
    setSqlQuery('');
    setData([]);
    setRelevantNodes([]);

    try {
      const response = await fetch(`${API_BASE_URL}/generate_sql_and_data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'Failed to fetch data from the server.');
      }

      console.log('Successfully received data from backend:', result);
      setSqlQuery(result.sql_query);
      setData(result.data);
      setRelevantNodes(result.relevant_nodes);

    } catch (err) {
      console.error('Frontend Fetch Error:', err);
      setError('Could not connect to the backend. Please ensure the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  // ==============================================================================
  // Part 4: Vis.js Visualization Effect
  // ==============================================================================
  useEffect(() => {
    if (!isVisLoaded || !schemaData || !visRef.current) {
      return;
    }
  
    const nodes = [];
    const edges = [];
  
    // Add nodes and edges for the full schema
    for (const tableName in schemaData.tables) {
      nodes.push({ id: tableName, label: tableName, group: 'tables' });
      schemaData.tables[tableName].columns.forEach(colName => {
        const colId = `${tableName}.${colName}`;
        nodes.push({ id: colId, label: colName, group: 'columns' });
        edges.push({ from: colId, to: tableName, arrows: 'to' });
      });
    }
  
    // Add relationship edges (foreign keys)
    schemaData.relationships.forEach(rel => {
      edges.push({
        from: `${rel.from_table}.${rel.from_col}`,
        to: `${rel.to_table}.${rel.to_col}`,
        arrows: 'to',
        color: { color: 'red' },
        dashes: true,
        label: 'FK'
      });
    });
  
    // Highlight relevant nodes based on the query result
    nodes.forEach(node => {
      if (relevantNodes.includes(node.id)) {
        node.color = { background: '#ADD8E6', border: '#4682B4' };
        node.font = { multi: 'html', bold: true };
      } else {
        node.color = { background: '#EAEAEA', border: '#999999' };
        node.font = { multi: false, bold: false };
      }
    });

    const visData = { nodes: new window.vis.DataSet(nodes), edges: new window.vis.DataSet(edges) };
    const options = {
      nodes: {
        shape: 'box',
        font: { multi: 'html', size: 12 },
        color: { background: '#EAEAEA', border: '#999999' }
      },
      edges: {
        arrows: 'to',
        color: 'gray',
        smooth: { type: 'cubicBezier' }
      },
      layout: {
        hierarchical: {
          direction: 'UD',
          sortMethod: 'hubsize'
        }
      },
      physics: {
        enabled: true,
        solver: 'barnesHut',
        barnesHut: {
          gravitationalConstant: -2000,
          springConstant: 0.05
        }
      }
    };
  
    if (visNetworkRef.current) {
        visNetworkRef.current.destroy();
    }
    visNetworkRef.current = new window.vis.Network(visRef.current, visData, options);

    // Clean up the network instance on component unmount
    return () => {
      if (visNetworkRef.current) {
          visNetworkRef.current.destroy();
      }
    };
  }, [isVisLoaded, schemaData, relevantNodes]); // Rerun when schema or relevantNodes change

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans antialiased text-gray-800 flex flex-col items-center">
      <div className="max-w-4xl w-full bg-white p-8 rounded-2xl shadow-xl space-y-8">
        <h1 className="text-4xl font-bold text-center text-indigo-700">Metagraph Text-to-SQL</h1>

        {/* Query Form */}
        <form onSubmit={handleSubmit} className="flex gap-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 px-4 py-3 text-lg border-2 border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="e.g., 'What are the names of all employees?'"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-all duration-300 transform hover:scale-105 flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              <>
                <Search size={24} />
                <span>Generate</span>
              </>
            )}
          </button>
        </form>

        {/* Results */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-inner mt-4">
            <p>{error}</p>
          </div>
        )}

        {sqlQuery && (
          <div className="space-y-6">
            <div className="bg-gray-50 p-6 rounded-lg shadow-inner">
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">Generated SQL Query:</h2>
              <pre className="bg-gray-200 text-gray-900 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                {sqlQuery}
              </pre>
            </div>
            
            <div className="bg-gray-50 p-6 rounded-lg shadow-inner">
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">Query Results:</h2>
              {data.length > 0 ? (
                <div className="overflow-x-auto rounded-lg shadow-md">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-300">
                      <tr>
                        {Object.keys(data[0]).map((key) => (
                          <th key={key} className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {data.map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-gray-50">
                          {Object.values(row).map((value, valueIndex) => (
                            <td key={valueIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {value}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No data returned for this query.</p>
              )}
            </div>
          </div>
        )}

        {/* Metagraph Visualization */}
        <div className="space-y-6">
          <div className="bg-gray-50 p-6 rounded-lg shadow-inner">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">Metagraph Visualization:</h2>
            <div className="w-full h-96 bg-gray-200 rounded-lg shadow-md flex items-center justify-center">
              {schemaData ? (
                 <div ref={visRef} className="w-full h-full rounded-lg"></div>
              ) : (
                <p className="text-gray-500">Loading schema...</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
