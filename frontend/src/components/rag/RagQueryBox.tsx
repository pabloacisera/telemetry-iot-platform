import { useState } from 'react';
import type { FormEvent } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import { askRag } from '../../store/rag.slice';

interface RagQueryBoxProps {
  motorId?: number;
}

/**
 * RAG query box — allows operators to ask natural language questions.
 * Displays the conversation history and handles the 3 response types:
 * healthy data, unreliable sensor, no data / redirect to Grafana.
 */
export function RagQueryBox({ motorId }: RagQueryBoxProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { messages, loading } = useSelector((state: RootState) => state.rag);
  const [question, setQuestion] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    dispatch(askRag({ motorId, question: question.trim() }));
    setQuestion('');
  };

  return (
    <div className="rag-box">
      <h3>Asistente IA</h3>
      <div className="rag-messages" aria-live="polite">
        {messages.map((msg, i) => (
          <div key={i} className={`rag-message rag-${msg.role}`}>
            <strong>{msg.role === 'user' ? 'Tú' : 'Asistente'}:</strong>
            <p>{msg.content}</p>
          </div>
        ))}
        {loading && <p className="rag-loading">Pensando...</p>}
      </div>
      <form onSubmit={handleSubmit} className="rag-form">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Preguntá sobre este motor..."
          disabled={loading}
          aria-label="Preguntar al asistente IA"
        />
        <button type="submit" disabled={loading || !question.trim()}>
          Preguntar
        </button>
      </form>
    </div>
  );
}
