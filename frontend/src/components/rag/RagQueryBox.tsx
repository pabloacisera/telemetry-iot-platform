import { useState } from 'react';
import type { FormEvent } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import { askRag } from '../../store/rag.slice';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface RagQueryBoxProps {
  motorId?: number;
}

/**
 * RAG chat box — sends questions to the backend LLM and renders Markdown responses.
 * Supports tables, bold, lists, and inline code from the assistant.
 */
export function RagQueryBox({ motorId }: RagQueryBoxProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { messages, loading } = useSelector((state: RootState) => state.rag);
  const [question, setQuestion] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    // Send the existing turns so the assistant has conversation context.
    // The current question is not included (it's appended by the pending action).
    dispatch(askRag({ motorId, question: question.trim(), history: messages }));
    setQuestion('');
  };

  return (
    <div className="rag-box">
      <h3>Asistente IA</h3>
      <div className="rag-messages" aria-live="polite">
        {messages.map((msg, i) => (
          <div key={i} className={`rag-message rag-${msg.role}`}>
            <strong>{msg.role === 'user' ? 'Tú' : 'Asistente'}:</strong>
            {msg.role === 'assistant' ? (
              <div className="rag-markdown">
                <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
              </div>
            ) : (
              <p>{msg.content}</p>
            )}
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
