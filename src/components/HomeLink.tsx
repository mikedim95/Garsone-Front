import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export const HomeLink = ({ className = '' }: { className?: string }) => (
  <Link
    to="/"
    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition ${className}`}
    aria-label="Back to Home"
    title="Back to Home"
  >
    <Home className="h-4 w-4" />
    <span className="hidden sm:inline">Back to Home</span>
    <span className="sm:hidden">Home</span>
  </Link>
);

