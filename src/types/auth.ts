export type UserRole = 'professor' | 'student' | 'ta'

export type CurrentUser = {
  id: string
  email: string
  name: string
  role: UserRole
  institutionId: string
}
