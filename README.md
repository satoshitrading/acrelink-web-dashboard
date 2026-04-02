# Welcome to your Acrelink project

## Project info

**URL**: https://app.myacrelink.com/

## How can I edit this code?

There are several ways of editing your application.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

To deploy this project to Vercel:

1. Commit your changes to your feature branch
2. Create a Pull Request to merge with the main branch
3. Once the PR is merged to main, Vercel will automatically run the build and deploy your changes to production
4. Monitor the deployment status on your Vercel dashboard

No additional configuration needed - the deployment pipeline is automatically triggered on every merge to the main branch.

## User Management

### How to assign Admin

1. Create a new user through the application
2. Go to Firebase Console
3. Edit the user's custom claims/role to set role as `admin`
4. Set `siteId` to empty for admin users
5. Admin users will have access to all features and sites

### How to assign Technician

Admin users can assign technicians:

1. Admin clicks on "Add Technician" button in the application
2. Fill in the technician's details
3. Assign multiple `siteId`s to the technician (the sites they will manage)
4. The technician will have access only to the assigned sites

### How to edit Email

**Important**: Email cannot be edited directly because Firebase does not support email authentication changes in this way.

To change a user's email:

1. Create a new user with the correct email address
2. Assign the same roles and permissions to the new user
3. Delete or deactivate the old user account
4. Users should use the new email for future logins
