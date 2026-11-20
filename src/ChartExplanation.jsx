export default function ChartExplanation({ question, inference }) {
  return (
    <details className="chart-explanation">
      <summary>{question}</summary>
      <p><strong>Inference:</strong> {inference}</p>
    </details>
  );
}
