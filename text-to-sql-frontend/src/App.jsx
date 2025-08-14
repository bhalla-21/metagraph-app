import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';

const App = () => {
  // State for user input and API responses
  const [query, setQuery] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [data, setData] = useState([]);
  const [graphDetails, setGraphDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Ref for the canvas element
  const canvasRef = useRef(null);

  // Function to handle form submission and API call
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query) return;

    setIsLoading(true);
    setError(null);
    setSqlQuery('');
    setData([]);
    setGraphDetails(null);

    try {
      // Make a POST request to the backend API
      const response = await fetch('/generate_sql_and_data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch data from the server.');
      }

      // Parse and set the response data
      const result = await response.json();
      console.log('Successfully received data from backend:', result);
      setSqlQuery(result.sql_query);
      setData(result.data);
      setGraphDetails(result.graph_details);

    } catch (err) {
      console.error('Frontend Fetch Error:', err);
      setError('Could not connect to the backend. Please ensure the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  // useEffect hook to handle the canvas visualization
  useEffect(() => {
    console.log('useEffect triggered. Current graphDetails:', graphDetails);
    // Only run if graph details are available and there are nodes to draw
    if (!graphDetails || !canvasRef.current || graphDetails.nodes.length === 0) {
      console.log('Skipping canvas drawing due to missing graph data.');
      return;
    }
    
    console.log('Drawing metagraph with data:', graphDetails);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let animationFrameId;

    // Set canvas size for high-DPI displays and responsiveness
    const setCanvasSize = () => {
      const parent = canvas.parentElement;
      canvas.width = parent.clientWidth * dpr;
      canvas.height = 400 * dpr;
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `400px`;
    };

    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    // Initialize force-directed graph simulation variables
    const nodes = graphDetails.nodes.map(node => ({
      ...node,
      // Random initial position
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: 0,
      vy: 0,
      // Node size and color based on type
      radius: node.attributes.type === 'table' ? 12 : 8,
      color: node.attributes.type === 'table' ? '#4f46e5' : '#10b981',
      label: node.name,
    }));

    const edges = graphDetails.edges;
    
    // Main animation loop
    const animate = () => {
      // Clear canvas for a fresh frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#e5e7eb'; // Gray-200 background color
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Apply forces for simulation
      // Repulsion force between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 20000) { // Repulsion distance
            const dist = Math.sqrt(distSq);
            const force = 1000 / dist; // Simple repulsion formula
            nodes[i].vx -= force * (dx / dist);
            nodes[i].vy -= force * (dy / dist);
            nodes[j].vx += force * (dx / dist);
            nodes[j].vy += force * (dy / dist);
          }
        }
      }

      // Attraction force for edges
      for (const edge of edges) {
        const source = nodes.find(n => n.name === edge.from);
        const target = nodes.find(n => n.name === edge.to);
        if (source && target) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const force = dist * 0.01; // Simple spring force
          source.vx += force * (dx / dist);
          source.vy += force * (dy / dist);
          target.vx -= force * (dx / dist);
          target.vy -= force * (dy / dist);
        }
      }

      // Update positions and apply damping/boundary checks
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.95; // Damping
        node.vy *= 0.95;
        
        // Boundary check to keep nodes within canvas
        if (node.x < node.radius) node.x = node.radius;
        if (node.x > canvas.width - node.radius) node.x = canvas.width - node.radius;
        if (node.y < node.radius) node.y = node.radius;
        if (node.y > canvas.height - node.radius) node.y = canvas.height - node.radius;
      }
      
      // Draw edges
      ctx.beginPath();
      for (const edge of edges) {
        const source = nodes.find(n => n.name === edge.from);
        const target = nodes.find(n => n.name === edge.to);
        if (source && target) {
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
        }
      }
      ctx.strokeStyle = '#9ca3af';
      ctx.stroke();

      // Draw nodes and labels
      for (const node of nodes) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = node.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.font = `${12 * dpr}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000000';
        ctx.fillText(node.label, node.x, node.y + node.radius + 12 * dpr);
      }
      
      animationFrameId = requestAnimationFrame(animate);
    };

    // Start the animation loop
    animate();

    // Cleanup function to remove event listener and cancel animation frame
    return () => {
      window.removeEventListener('resize', setCanvasSize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [graphDetails]); // The effect depends on graphDetails, so it re-runs when new data arrives

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
            placeholder="e.g., 'Which employee is the manager of 'Steven Buchanan'?'"
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
            {graphDetails && graphDetails.nodes.length > 0 ? (
              <>
                {/* Legend for the graph */}
                <div className="flex justify-center items-center mb-4">
                  <div className="flex items-center mr-6">
                    <div className="w-4 h-4 rounded-full bg-indigo-600 mr-2 border border-gray-400"></div>
                    <span className="text-gray-700">Table Node</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-4 h-4 rounded-full bg-emerald-500 mr-2 border border-gray-400"></div>
                    <span className="text-gray-700">Column Node</span>
                  </div>
                </div>
                {/* Canvas container */}
                <div className="w-full h-96 bg-gray-200 rounded-lg shadow-md relative overflow-hidden">
                  <canvas ref={canvasRef} className="absolute inset-0"></canvas>
                </div>
              </>
            ) : (
              // Display a message when no graph data is available
              <div className="w-full h-96 bg-gray-200 rounded-lg shadow-md flex items-center justify-center">
                <p className="text-gray-500">Submit a query to see the metagraph visualization.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
