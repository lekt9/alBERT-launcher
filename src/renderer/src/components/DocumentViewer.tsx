// @components/DocumentViewer.tsx
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { X, FileText, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Document {
  path: string;
  content: string;
  metadata?: {
    type: 'file' | 'web';
    lastModified: number;
  };
}

interface DocumentViewerProps {
  contextDocuments: Document[];
  removeFromContext: (path: string) => void;
  hoveredCardPath: string | null;
  setHoveredCardPath: (path: string | null) => void;
}

const cardVariants = {
  initial: {
    x: 0,
    opacity: 0,
    scale: 0.8,
  },
  animate: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.05,
    },
  },
  exit: {
    x: -20,
    opacity: 0,
    scale: 0.8,
    transition: {
      duration: 0.05,
    },
  },
};

const DocumentViewer: React.FC<DocumentViewerProps> = React.memo(
  ({ contextDocuments, removeFromContext, hoveredCardPath, setHoveredCardPath }) => {
    const calculateCardPositions = (
      totalCards: number,
      containerHeight: number,
      hoveredPath: string | null,
      currentPath: string,
      index: number,
      cardHeight: number = 200
    ) => {
      const minSpacing = 40;
      const availableSpace = containerHeight - cardHeight;
      const spacing = totalCards > 1 ? Math.max(minSpacing, availableSpace / (totalCards - 1)) : 0;

      return {
        bottom: index * spacing,
        zIndex: hoveredPath === currentPath ? 999 : index,
      };
    };

    return (
      <div
        className="relative"
        style={{
          width: 600,
          height: '600px',
        }}
      >
        <div className="absolute top-0 right-0 p-4 z-[1000]">
          <button
            onClick={() => {
              // Logic to close document viewer and clear context
            }}
            className="text-foreground/70 hover:text-foreground bg-background/20 rounded-full p-2 backdrop-blur-sm"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <AnimatePresence>
          {contextDocuments.map((doc, index) => {
            const positions = calculateCardPositions(
              contextDocuments.length,
              600,
              hoveredCardPath,
              doc.path,
              index
            );
            const isWebSource = doc.metadata?.type === 'web' || doc.path.startsWith('http');
            return (
              <motion.div
                key={doc.path}
                initial="initial"
                animate="animate"
                exit="exit"
                variants={cardVariants}
                className="absolute left-0 right-0"
                style={{
                  bottom: positions.bottom,
                  zIndex: positions.zIndex,
                }}
              >
                <Card
                  className="bg-background/95 shadow-lg backdrop-blur-sm hover:shadow-xl transition-all duration-200 hover:translate-y-2"
                  onMouseEnter={() => setHoveredCardPath(doc.path)}
                  onMouseLeave={() => setHoveredCardPath(null)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        {isWebSource ? (
                          <Globe className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                        <h3 className="text-sm font-semibold">
                          {doc.path.split('/').pop()}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {isWebSource ? 'Web Source' : 'Document'}
                          </span>
                        </h3>
                      </div>
                      <button
                        onClick={() => removeFromContext(doc.path)}
                        className="text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="prose prose-sm max-w-none max-h-[200px] overflow-y-auto">
                      <ReactMarkdown>{doc.content}</ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    );
  }
);

DocumentViewer.displayName = 'DocumentViewer';

export default DocumentViewer;