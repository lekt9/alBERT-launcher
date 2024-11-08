// @components/AIResponseCard.tsx
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface AIResponse {
  question: string;
  answer: string;
  timestamp: number;
}

interface AIResponseCardProps {
  currentConversation: AIResponse;
  selectedIndex: number;
  addAIResponseToContext: () => void;
}

const AIResponseCard: React.FC<AIResponseCardProps> = React.memo(
  ({ currentConversation, selectedIndex, addAIResponseToContext }) => {
    return (
      <div className="overflow-hidden flex-shrink-0 max-h-[300px] overflow-y-auto">
        <div
          className={cn(
            'border-b cursor-pointer transition-all duration-200 overflow-y-auto',
            selectedIndex === -1 ? 'bg-accent border-primary' : 'hover:bg-accent/50'
          )}
          onClick={addAIResponseToContext}
        >
          <div className="m-2">
            <Card
              className={cn(
                'transition-all duration-200',
                selectedIndex === -1 ? 'bg-accent border-primary' : ''
              )}
            >
              <CardContent className="p-3 flex items-start space-x-3">
                <div className="flex gap-2">
                  <div className="bg-muted rounded-full p-2 mt-1">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-muted-foreground mb-2">
                    {currentConversation.question}
                  </div>
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{currentConversation.answer}</ReactMarkdown>
                  </div>
                  <div className="flex items-center mt-2 space-x-2">
                    <Badge variant="secondary">AI Response</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(currentConversation.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center mt-2 text-xs text-muted-foreground">
                    <span>
                      {selectedIndex === -1
                        ? 'Press → to pin to context'
                        : 'Press ↑ to select'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }
);

AIResponseCard.displayName = 'AIResponseCard';

export default AIResponseCard;