// @components/ContextTabs.tsx
import React, { useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface ContextTab {
  path: string;
  content: string;
  isExpanded: boolean;
  metadata?: {
    type: string;
    lastModified?: number;
    size?: number;
    language?: string;
    matchScore?: number;
  };
}

interface ContextTabsProps {
  contextTabs: ContextTab[];
  setContextTabs: React.Dispatch<React.SetStateAction<ContextTab[]>>;
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
      duration: 0.2,
    },
  },
  exit: {
    x: -20,
    opacity: 0,
    scale: 0.8,
    transition: {
      duration: 0.2,
    },
  },
};

const ContextTabs: React.FC<ContextTabsProps> = ({ contextTabs, setContextTabs }) => {
  
  const toggleTab = useCallback((path: string) => {
    setContextTabs((prev) =>
      prev.map((tab) =>
        tab.path === path ? { ...tab, isExpanded: !tab.isExpanded } : tab
      )
    );
  }, [setContextTabs]);

  const removeTab = useCallback((path: string) => {
    setContextTabs((prev) => prev.filter((tab) => tab.path !== path));
  }, [setContextTabs]);

  return (
    <AnimatePresence>
      {contextTabs.length > 0 && (
        <motion.div
          className="fixed right-0 top-0 h-screen flex flex-col gap-2 ml-2"
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 300, opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {contextTabs.map((tab) => (
            <motion.div
              key={tab.path}
              variants={cardVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Card
                className={cn(
                  "bg-background/95 shadow-lg cursor-pointer hover:shadow-xl transition-all",
                  "w-[400px] min-h-[40px]"
                )}
                onClick={() => toggleTab(tab.path)}
              >
                <CardContent className="p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="bg-muted rounded-full p-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="truncate">
                        <div className="text-sm font-medium truncate">
                          {tab.path.split('/').pop()}
                        </div>
                        {tab.metadata?.type && (
                          <div className="text-xs text-muted-foreground">
                            {tab.metadata.type}
                          </div>
                        )}
                        {tab.metadata?.lastModified && (
                          <div className="text-xs text-muted-foreground">
                            Modified: {new Date(tab.metadata.lastModified).toLocaleDateString()}
                          </div>
                        )}
                        {tab.metadata?.matchScore && (
                          <div className="text-xs text-muted-foreground">
                            Match: {(tab.metadata.matchScore * 100).toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTab(tab.path);
                      }}
                      className="text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {tab.isExpanded && (
                    <div className="mt-2 prose prose-sm max-w-none max-h-[200px] overflow-y-auto">
                      <ReactMarkdown>{tab.content}</ReactMarkdown>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

ContextTabs.displayName = 'ContextTabs';

export default ContextTabs;