import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { X, Plus, Loader2 } from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { api } from "../lib/api";

interface AIProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIProfileDialog({ open, onOpenChange }: AIProfileDialogProps) {
  const [attributes, setAttributes] = useState<string[]>(['']);
  const [writingStyle, setWritingStyle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    console.log('Dialog open state changed:', open);
    if (open) {
      console.log('Fetching profile...');
      fetchProfile();
    }
  }, [open]);

  const fetchProfile = async () => {
    console.log('fetchProfile called');
    setIsLoading(true);
    try {
      console.log('Making API request...');
      const data = await api.fetch('/api/v1/ai/profile', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      console.log('API response:', data);
      
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format');
      }
      
      // Ensure at least one empty field if no traits exist
      setAttributes(Array.isArray(data.personalityTraits) && data.personalityTraits.length > 0 
        ? data.personalityTraits 
        : ['']);
      setWritingStyle(data.writingStyle || '');
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({
        title: "Error",
        description: "Failed to load AI profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAttributeChange = (index: number, value: string) => {
    const newAttributes = [...attributes];
    newAttributes[index] = value;
    
    // Add new empty input if the last one is being typed in
    if (index === attributes.length - 1 && value !== '') {
      newAttributes.push('');
    }
    
    setAttributes(newAttributes);
  };

  const removeAttribute = (index: number) => {
    const newAttributes = attributes.filter((_, i) => i !== index);
    // Ensure there's always at least one empty input
    if (newAttributes.length === 0) {
      newAttributes.push('');
    }
    setAttributes(newAttributes);
  };

  const handleSave = async () => {
    try {
      setIsSubmitting(true);
      
      // Filter out empty attributes
      const filteredAttributes = attributes.filter(attr => attr.trim() !== '');
      
      if (filteredAttributes.length === 0) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Please add at least one personality trait",
        });
        return;
      }

      if (!writingStyle.trim()) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Please provide a writing style description",
        });
        return;
      }

      const response = await api.fetch("/api/v1/ai/profile", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalityTraits: filteredAttributes,
          writingStyle: writingStyle.trim()
        })
      });

      toast({
        title: "Success",
        description: "AI profile updated successfully",
      });

      onOpenChange(false);
      
      // Reset form
      setAttributes(['']);
      setWritingStyle('');
      
    } catch (error) {
      console.error('Error updating AI profile:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update AI profile",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>AI Avatar Profile</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 py-4">
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Personality Attributes</h3>
                <div className="space-y-2">
                  {attributes.map((attribute, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={attribute}
                        onChange={(e) => handleAttributeChange(index, e.target.value)}
                        placeholder="Enter an attribute (e.g., friendly, sarcastic)"
                        className="flex-1"
                        disabled={isSubmitting || isLoading}
                      />
                      {index !== attributes.length - 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAttribute(index)}
                          className="h-10 w-10"
                          disabled={isSubmitting || isLoading}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Writing Style</h3>
                <Textarea
                  value={writingStyle}
                  onChange={(e) => setWritingStyle(e.target.value)}
                  placeholder="Describe the writing style of your AI avatar..."
                  className="min-h-[100px]"
                  disabled={isSubmitting || isLoading}
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting || isLoading}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSave}
                disabled={isSubmitting || isLoading}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
} 