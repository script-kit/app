import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import ChoiceButton from './button'
import { Provider } from 'jotai'
import type { ChoiceButtonProps } from '../../../shared/types'
import type { ScoredChoice } from '@johnlindquist/kit/types/core'

// Mock window.electron
global.window = {
  ...global.window,
  electron: {
    ipcRenderer: {
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    }
  }
} as any

describe('ChoiceButton emoji display', () => {
  const createScoredChoice = (choice: any): ScoredChoice => ({
    item: choice,
    score: 1,
    matches: {},
    _: ''
  })

  const createButtonProps = (choice: any): ChoiceButtonProps => ({
    index: 0,
    style: {},
    data: {
      choices: [createScoredChoice(choice)]
    }
  })

  it('should display emoji when choice has emoji property', () => {
    const choiceWithEmoji = {
      id: 'test-1',
      name: 'Test Choice',
      value: 'test',
      emoji: '🚀',
      description: 'A test choice with emoji'
    }

    const { container } = render(
      <Provider>
        <ChoiceButton {...createButtonProps(choiceWithEmoji)} />
      </Provider>
    )

    // Check if emoji is rendered
    const emojiElement = screen.getByText('🚀')
    expect(emojiElement).toBeDefined()
    
    // The emoji is directly in a div, check that div's classes
    const emojiContainer = emojiElement
    expect(emojiContainer).toBeDefined()
  })

  it('should not display emoji container when choice has no emoji', () => {
    const choiceWithoutEmoji = {
      id: 'test-2',
      name: 'Test Choice',
      value: 'test',
      description: 'A test choice without emoji'
    }

    const { container } = render(
      <Provider>
        <ChoiceButton {...createButtonProps(choiceWithoutEmoji)} />
      </Provider>
    )

    // Check that no emoji container is rendered
    const emojiContainers = container.querySelectorAll('.text-2xl')
    expect(emojiContainers.length).toBe(0)
  })

  it('should display both emoji and img when both are present', () => {
    const choiceWithBoth = {
      id: 'test-3',
      name: 'Test Choice',
      value: 'test',
      emoji: '⭐',
      img: 'https://example.com/test.png',
      description: 'A test choice with both emoji and image'
    }

    const { container } = render(
      <Provider>
        <ChoiceButton {...createButtonProps(choiceWithBoth)} />
      </Provider>
    )

    // Check if emoji is rendered
    const emojiElement = screen.getByText('⭐')
    expect(emojiElement).toBeDefined()
    
    // Check if img element exists
    const imgElement = container.querySelector('img')
    expect(imgElement).toBeDefined()
    expect(imgElement?.src).toBe('https://example.com/test.png')
  })

  it('should handle multiple emojis in the emoji property', () => {
    const choiceWithMultipleEmojis = {
      id: 'test-4',
      name: 'Party Time',
      value: 'party',
      emoji: '🎉🎊🎈',
      description: 'Multiple emojis test'
    }

    const { container } = render(
      <Provider>
        <ChoiceButton {...createButtonProps(choiceWithMultipleEmojis)} />
      </Provider>
    )

    // Check if all emojis are rendered
    const emojiElement = screen.getByText('🎉🎊🎈')
    expect(emojiElement).toBeDefined()
  })
})