Who has the codebase hygene task should check sonarcloud for possible issues. 
 - Check security assertion
 - Check code duplication
 - Check test coverage
 
After the refactor of the codebase to make it SOLID and clean architecture compliant write a documentation to describe the architecture and the design decisions. 
The priority should always be code coverage, then SOLID principles, then clean architecture.
From now on after a merge on validation branch all the issues shoudl be fixed and checked against documentation for SOLID and clean architecture compliance.
SonarCloud is started in the CI github workflow from the first sprint at every merge or Pull Request on master branch.