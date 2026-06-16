import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient } from './server'
import { createServerClient } from '@supabase/ssr'

// Mock next/headers
const mockGetAll = vi.fn()
const mockSet = vi.fn()

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(() => Promise.resolve({
    getAll: mockGetAll,
    set: mockSet,
  })),
}))

// Mock @supabase/ssr
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn().mockImplementation((url, key, options) => {
    return { url, key, options }
  }),
}))

describe('createClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'example-anon-key'
  })

  it('should initialize successfully in an Action/Handler Context (writable cookies)', async () => {
    mockGetAll.mockReturnValue([{ name: 'test-cookie', value: 'test-value' }])

    const client = await createClient()

    // Assert createServerClient was called correctly
    expect(createServerClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'example-anon-key',
      expect.objectContaining({
        cookies: expect.any(Object)
      })
    )

    // Ensure getAll works
    const options = (createServerClient as any).mock.calls[0][2]
    const allCookies = options.cookies.getAll()
    expect(allCookies).toEqual([{ name: 'test-cookie', value: 'test-value' }])
    expect(mockGetAll).toHaveBeenCalled()

    // Ensure setAll works (simulate Server Action / Route Handler context)
    const cookiesToSet = [{ name: 'new-cookie', value: 'new-value', options: { path: '/' } }]
    options.cookies.setAll(cookiesToSet)

    expect(mockSet).toHaveBeenCalledWith('new-cookie', 'new-value', { path: '/' })
  })

  it('should initialize successfully in a Server Component Context (read-only cookies)', async () => {
    mockSet.mockImplementation(() => {
      throw new Error('Readonly Request Cookies cannot be modified.')
    })

    const client = await createClient()

    const options = (createServerClient as any).mock.calls[0][2]

    // Attempt to set a cookie, which should throw in mockSet
    const cookiesToSet = [{ name: 'fail-cookie', value: 'fail-value', options: { path: '/' } }]

    // This should not throw an error because the catch block in createClient swallows it
    expect(() => options.cookies.setAll(cookiesToSet)).not.toThrow()

    // Verify mockSet was indeed called and the error was swallowed
    expect(mockSet).toHaveBeenCalledWith('fail-cookie', 'fail-value', { path: '/' })

    // Client should still be returned successfully
    expect(client).toBeDefined()
  })
})
