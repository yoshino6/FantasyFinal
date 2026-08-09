ALTER TABLE registration_sessions MODIFY stage ENUM('story','audience','question','destination','danger','choice') NOT NULL DEFAULT 'story';
