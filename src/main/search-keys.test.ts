import { describe, it, expect } from 'vitest';
import { searchChoices } from './vscode-search';
import type { Choice } from '@johnlindquist/kit/types/core';

describe('searchKeys functionality', () => {
  it('should search only by description when searchKeys is ["description"]', () => {
    const choices: Choice[] = [
      {
        id: '1',
        name: 'something',
        description: 'https://github.com/johnlindquist/kit',
      },
      {
        id: '2',
        name: 'github related',
        description: 'A tool for managing repositories',
      },
      {
        id: '3',
        name: 'another item',
        description: 'unrelated content',
      },
    ];

    // Search for "github" with searchKeys set to only description
    const results = searchChoices(choices, 'github', ['description']);

    // Should only find the first choice that has "github" in the description
    expect(results).toHaveLength(1);
    expect(results[0].item.id).toBe('1');
    expect(results[0].item.name).toBe('something');
    
    // Should have matches in description field
    expect(results[0].matches).toHaveProperty('description');
    expect(results[0].matches.description).toBeDefined();
  });

  it('should not find matches in name when searchKeys is ["description"]', () => {
    const choices: Choice[] = [
      {
        id: '1',
        name: 'github tools',
        description: 'Some unrelated description',
      },
      {
        id: '2',
        name: 'something else',
        description: 'Contains github in description',
      },
    ];

    // Search for "github" with searchKeys set to only description
    const results = searchChoices(choices, 'github', ['description']);

    // Should only find the second choice
    expect(results).toHaveLength(1);
    expect(results[0].item.id).toBe('2');
    
    // Should not find the first choice even though "github" is in the name
    const foundIds = results.map(r => r.item.id);
    expect(foundIds).not.toContain('1');
  });

  it('should search multiple fields when searchKeys includes them', () => {
    const choices: Choice[] = [
      {
        id: '1',
        name: 'test item',
        description: 'unrelated',
        keyword: 'testing',
      },
      {
        id: '2',
        name: 'unrelated',
        description: 'test description',
        keyword: 'something',
      },
      {
        id: '3',
        name: 'another',
        description: 'another',
        keyword: 'test keyword',
      },
    ];

    // Search with multiple fields
    const results = searchChoices(choices, 'test', ['name', 'description', 'keyword']);

    // Should find all three choices
    expect(results).toHaveLength(3);
    
    // Verify each has matches in the expected field
    const choice1 = results.find(r => r.item.id === '1');
    expect(choice1?.matches).toHaveProperty('name');
    
    const choice2 = results.find(r => r.item.id === '2');
    expect(choice2?.matches).toHaveProperty('description');
    
    const choice3 = results.find(r => r.item.id === '3');
    expect(choice3?.matches).toHaveProperty('keyword');
  });

  it('should use default searchKeys when not specified', () => {
    const choices: Choice[] = [
      {
        id: '1',
        name: 'test name',
        description: 'unrelated',
      },
      {
        id: '2',
        name: 'unrelated',
        keyword: 'test',
      },
      {
        id: '3',
        name: 'unrelated',
        tag: 'test',
      },
    ];

    // Search without specifying searchKeys (should use default: ['name', 'keyword', 'tag'])
    const results = searchChoices(choices, 'test');

    // Should find all three that have "test" in name, keyword, or tag
    expect(results).toHaveLength(3);
    
    // Should not search description by default
    const choiceWithTestInDescription: Choice = {
      id: '4',
      name: 'no match',
      description: 'test is here',
    };
    
    const resultsWithDesc = searchChoices([...choices, choiceWithTestInDescription], 'test');
    const foundIds = resultsWithDesc.map(r => r.item.id);
    expect(foundIds).not.toContain('4');
  });
});