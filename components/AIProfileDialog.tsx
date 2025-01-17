import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../client/src/components/ui/dialog";
import { Button } from "../client/src/components/ui/button";
import { Input } from "../client/src/components/ui/input";
import { Textarea } from "../client/src/components/ui/textarea";
import { X, Plus, Loader2 } from "lucide-react";
import { useToast } from "../client/src/hooks/use-toast";
import { api } from "../client/src/lib/api";

interface AIProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIProfileDialog({ open, onOpenChange }: AIProfileDialogProps) {
  const [attributes, setAttributes] = useState<string[]>([""]);
  const [writingStyle, setWritingStyle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchProfile();
    }
  }, [open]);

  const fetchProfile = async () => {
    setIsLoading(true);
    try {
      const response = await api.fetch('/api/v1/ai/profile');
      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }
      const data = await response.json();
      
      // Ensure at least one empty field if no traits exist
      setAttributes(data.personalityTraits.length > 0 ? data.personalityTraits : ['']);
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

  const handleAddAttribute = () => {
    setAttributes([...attributes, ""]);
  };

  const handleRemoveAttribute = (index: number) => {
    const newAttributes = attributes.filter((_, i) => i !== index);
    if (newAttributes.length === 0) {
      newAttributes.push(""); // Ensure at least one empty field
    }
    setAttributes(newAttributes);
  };

  const handleAttributeChange = (index: number, value: string) => {
    const newAttributes = [...attributes];
    newAttributes[index] = value;
    setAttributes(newAttributes);
  };

  const handleSave = async () => {
    const filteredAttributes = attributes.filter(attr => attr.trim() !== "");
    
    if (filteredAttributes.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one personality trait.",
        variant: "destructive",
      });
      return;
    }

    if (!writingStyle.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a writing style.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.fetch('/api/v1/ai/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalityTraits: filteredAttributes,
          writingStyle: writingStyle.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save profile');
      }

      toast({
        title: "Success",
        description: "AI profile updated successfully.",
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Error",
        description: "Failed to save AI profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>AI Avatar Settings</DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 text-sm font-medium">Personality Traits</h4>
                {attributes.map((attribute, index) => (
                  <div key={index} className="flex mb-2 gap-2">
                    <Input
                      value={attribute}
                      onChange={(e) => handleAttributeChange(index, e.target.value)}
                      placeholder="Enter a personality trait"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveAttribute(index)}
                      disabled={attributes.length === 1}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleAddAttribute}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Trait
                </Button>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-medium">Writing Style</h4>
                <Textarea
                  value={writingStyle}
                  onChange={(e) => setWritingStyle(e.target.value)}
                  placeholder="Describe the AI's writing style..."
                  className="min-h-[100px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSubmitting}
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
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
} 